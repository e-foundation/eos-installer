/**
 * Fastboot protocol type definitions.
 */

/** Fastboot response status prefixes (4 ASCII bytes) */
export enum FastbootResponse {
  Okay = "OKAY",
  Fail = "FAIL",
  Data = "DATA",
  Info = "INFO",
}

/** Parsed response from a fastboot command */
export interface FastbootResult {
  status: FastbootResponse;
  message: string;
  /** Present when status === Data — the expected data size */
  dataSize?: number;
}

// ---- Sparse Image Structures ----

/** Sparse image magic number: 0xED26FF3A */
export const SPARSE_MAGIC = 0xed26ff3a;

/** Sparse image file header (28 bytes) */
export interface SparseHeader {
  magic: number;
  majorVersion: number;
  minorVersion: number;
  fileHeaderSize: number;
  chunkHeaderSize: number;
  blockSize: number;
  totalBlocks: number;
  totalChunks: number;
  imageChecksum: number;
}

/** Size of the sparse file header in bytes */
export const SPARSE_HEADER_SIZE = 28;

/** Size of a sparse chunk header in bytes */
export const SPARSE_CHUNK_HEADER_SIZE = 12;

/** Sparse chunk types */
export enum SparseChunkType {
  Raw = 0xcac1,
  Fill = 0xcac2,
  DontCare = 0xcac3,
  Crc32 = 0xcac4,
}

/** Parsed sparse chunk header */
export interface SparseChunkHeader {
  type: SparseChunkType;
  chunkBlocks: number;
  /** Total size in bytes of this chunk (header + data) */
  totalSize: number;
}

/** Default fastboot command timeout (30 seconds) */
export const FASTBOOT_COMMAND_TIMEOUT_MS = 30_000;

/** Extended timeout for flash operations (5 minutes) */
export const FASTBOOT_FLASH_TIMEOUT_MS = 300_000;
