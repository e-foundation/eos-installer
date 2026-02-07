/**
 * Android sparse image format handling.
 *
 * Sparse images compress large partition images by omitting empty/dont-care
 * regions. This module detects, parses, and splits sparse images for devices
 * with limited download buffer sizes.
 *
 * Format:
 *  - 28-byte file header (magic, version, block/chunk counts)
 *  - Sequence of chunks, each with a 12-byte header + optional data
 *  - Chunk types: RAW (0xCAC1), FILL (0xCAC2), DONT_CARE (0xCAC3), CRC32 (0xCAC4)
 */

import {
  SPARSE_MAGIC,
  SPARSE_HEADER_SIZE,
  SPARSE_CHUNK_HEADER_SIZE,
  SparseChunkType,
  type SparseHeader,
  type SparseChunkHeader,
} from "./types.js";

/**
 * Check if a buffer starts with the sparse image magic number.
 */
export function isSparseImage(header: Uint8Array): boolean {
  if (header.byteLength < 4) return false;
  const view = new DataView(
    header.buffer,
    header.byteOffset,
    header.byteLength,
  );
  return view.getUint32(0, true) === SPARSE_MAGIC;
}

/**
 * Parse the 28-byte sparse image file header.
 */
export function parseSparseHeader(data: Uint8Array): SparseHeader {
  if (data.byteLength < SPARSE_HEADER_SIZE) {
    throw new Error(
      `Sparse header too short: ${data.byteLength} < ${SPARSE_HEADER_SIZE}`,
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getUint32(0, true);

  if (magic !== SPARSE_MAGIC) {
    throw new Error(
      `Not a sparse image: magic=0x${magic.toString(16)}, expected 0x${SPARSE_MAGIC.toString(16)}`,
    );
  }

  return {
    magic,
    majorVersion: view.getUint16(4, true),
    minorVersion: view.getUint16(6, true),
    fileHeaderSize: view.getUint16(8, true),
    chunkHeaderSize: view.getUint16(10, true),
    blockSize: view.getUint32(12, true),
    totalBlocks: view.getUint32(16, true),
    totalChunks: view.getUint32(20, true),
    imageChecksum: view.getUint32(24, true),
  };
}

/**
 * Parse a 12-byte sparse chunk header.
 */
export function parseChunkHeader(data: Uint8Array): SparseChunkHeader {
  if (data.byteLength < SPARSE_CHUNK_HEADER_SIZE) {
    throw new Error(
      `Chunk header too short: ${data.byteLength} < ${SPARSE_CHUNK_HEADER_SIZE}`,
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  return {
    type: view.getUint16(0, true) as SparseChunkType,
    chunkBlocks: view.getUint32(4, true),
    totalSize: view.getUint32(8, true),
  };
}

/**
 * Calculate the data size following a chunk header based on chunk type.
 */
function chunkDataSize(chunk: SparseChunkHeader, blockSize: number): number {
  switch (chunk.type) {
    case SparseChunkType.Raw:
      return chunk.chunkBlocks * blockSize;
    case SparseChunkType.Fill:
      return 4; // 4-byte fill pattern
    case SparseChunkType.DontCare:
      return 0;
    case SparseChunkType.Crc32:
      return 4; // 4-byte CRC32
    default:
      throw new Error(`Unknown sparse chunk type: 0x${(chunk.type as number).toString(16)}`);
  }
}

/**
 * Build a sparse image file header from parameters.
 */
function buildSparseHeader(
  blockSize: number,
  totalBlocks: number,
  totalChunks: number,
): Uint8Array {
  const buf = new ArrayBuffer(SPARSE_HEADER_SIZE);
  const view = new DataView(buf);

  view.setUint32(0, SPARSE_MAGIC, true);
  view.setUint16(4, 1, true); // major version
  view.setUint16(6, 0, true); // minor version
  view.setUint16(8, SPARSE_HEADER_SIZE, true); // file header size
  view.setUint16(10, SPARSE_CHUNK_HEADER_SIZE, true); // chunk header size
  view.setUint32(12, blockSize, true);
  view.setUint32(16, totalBlocks, true);
  view.setUint32(20, totalChunks, true);
  view.setUint32(24, 0, true); // checksum (unused)

  return new Uint8Array(buf);
}

/**
 * Split a sparse image into multiple sub-images, each smaller than maxSize.
 *
 * This is needed when the device's max-download-size is smaller than the
 * sparse image. Each sub-image is a valid sparse image that can be downloaded
 * and flashed independently.
 *
 * Each sub-image after the first includes a DONT_CARE chunk at the start to
 * skip the blocks already written by previous sub-images, so the device
 * writes each sub-image's data at the correct partition offset.
 *
 * Each sub-image's header totalBlocks = blocksOffset + dataBlocks, so the
 * chunk block sum matches the header (required by MediaTek LK and other
 * bootloaders that validate this).
 */
export async function splitSparseImage(
  blob: Blob,
  maxSize: number,
): Promise<Blob[]> {
  const headerBuf = new Uint8Array(await blob.slice(0, SPARSE_HEADER_SIZE).arrayBuffer());
  const header = parseSparseHeader(headerBuf);

  // Parse all chunks to build an index
  interface ChunkEntry {
    header: SparseChunkHeader;
    offset: number; // byte offset in the original blob (including chunk header)
    blocks: number;
  }

  const chunks: ChunkEntry[] = [];
  let offset = header.fileHeaderSize;

  for (let i = 0; i < header.totalChunks; i++) {
    const chunkHeaderBuf = new Uint8Array(
      await blob.slice(offset, offset + SPARSE_CHUNK_HEADER_SIZE).arrayBuffer(),
    );
    const chunkHeader = parseChunkHeader(chunkHeaderBuf);
    const dataSize = chunkDataSize(chunkHeader, header.blockSize);

    chunks.push({
      header: chunkHeader,
      offset,
      blocks: chunkHeader.chunkBlocks,
    });

    offset += SPARSE_CHUNK_HEADER_SIZE + dataSize;
  }

  // If the whole image fits, return it as-is
  if (blob.size <= maxSize) {
    return [blob];
  }

  // Group chunks into sub-images that fit within maxSize.
  // Each sub-image after the first reserves space for a DONT_CARE prefix chunk.
  const subImages: Blob[] = [];
  let currentChunks: ChunkEntry[] = [];
  let currentSize = SPARSE_HEADER_SIZE;
  let currentBlocks = 0;
  let blocksWrittenSoFar = 0;

  for (const chunk of chunks) {
    const dataSize = chunkDataSize(chunk.header, header.blockSize);
    const chunkTotalSize = SPARSE_CHUNK_HEADER_SIZE + dataSize;

    // If adding this chunk would exceed maxSize, finalize current sub-image
    if (
      currentChunks.length > 0 &&
      currentSize + chunkTotalSize > maxSize
    ) {
      subImages.push(
        buildSubImage(blob, header.blockSize, header.totalBlocks, currentChunks, blocksWrittenSoFar),
      );
      blocksWrittenSoFar += currentBlocks;
      currentChunks = [];
      // Reserve space for the DONT_CARE prefix chunk in subsequent sub-images
      currentSize = SPARSE_HEADER_SIZE + SPARSE_CHUNK_HEADER_SIZE;
      currentBlocks = 0;
    }

    currentChunks.push(chunk);
    currentSize += chunkTotalSize;
    currentBlocks += chunk.blocks;
  }

  // Finalize the last sub-image
  if (currentChunks.length > 0) {
    subImages.push(
      buildSubImage(blob, header.blockSize, header.totalBlocks, currentChunks, blocksWrittenSoFar),
    );
  }

  return subImages;
}

/**
 * Build a sub-image Blob from a subset of chunks.
 *
 * @param originalTotalBlocks  The ORIGINAL image's total block count.
 * @param blocksOffset Blocks already written by previous sub-images.
 *                     A DONT_CARE chunk is prepended to skip these blocks.
 */
function buildSubImage(
  originalBlob: Blob,
  blockSize: number,
  originalTotalBlocks: number,
  chunks: Array<{
    header: SparseChunkHeader;
    offset: number;
    blocks: number;
  }>,
  blocksOffset: number,
): Blob {
  const hasDontCarePrefix = blocksOffset > 0;
  const numChunks = chunks.length + (hasDontCarePrefix ? 1 : 0);

  // totalBlocks for this sub-image = offset blocks + data blocks.
  // The bootloader validates that chunk blocks sum to totalBlocks.
  const dataBlocks = chunks.reduce((sum, c) => sum + c.blocks, 0);
  const subImageTotalBlocks = blocksOffset + dataBlocks;

  const newHeader = buildSparseHeader(blockSize, subImageTotalBlocks, numChunks);
  const parts: BlobPart[] = [newHeader as BlobPart];

  // Prepend a DONT_CARE chunk to skip blocks written by previous sub-images
  if (hasDontCarePrefix) {
    parts.push(buildDontCareChunk(blocksOffset) as BlobPart);
  }

  for (const chunk of chunks) {
    const dataSize = chunkDataSize(chunk.header, blockSize);
    const chunkTotalSize = SPARSE_CHUNK_HEADER_SIZE + dataSize;
    // Slice the original chunk (header + data) from the source blob
    parts.push(originalBlob.slice(chunk.offset, chunk.offset + chunkTotalSize));
  }

  return new Blob(parts);
}

/**
 * Build a 12-byte DONT_CARE chunk header.
 * Used to skip blocks already written by previous sub-images.
 */
function buildDontCareChunk(chunkBlocks: number): Uint8Array {
  const buf = new ArrayBuffer(SPARSE_CHUNK_HEADER_SIZE);
  const view = new DataView(buf);
  view.setUint16(0, SparseChunkType.DontCare, true);
  view.setUint16(2, 0, true); // reserved
  view.setUint32(4, chunkBlocks, true);
  view.setUint32(8, SPARSE_CHUNK_HEADER_SIZE, true); // total size = header only
  return new Uint8Array(buf);
}
