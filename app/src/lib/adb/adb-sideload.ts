/**
 * ADB sideload protocol implementation.
 *
 * The sideload-host protocol transfers a file to a device in recovery mode.
 * The device requests specific blocks by number, and the host sends each
 * block's data in response.
 *
 * Protocol:
 *   1. Open stream with service "sideload-host:<filesize>:<maxpayload>"
 *   2. Device sends WRTE with ASCII block number (or "DONEDONE")
 *   3. Host sends OKAY, then WRTE with file data for that block
 *   4. Repeat until "DONEDONE"
 */

import { log } from "../types.js";
import type { SideloadProgressCallback } from "../types.js";
import { AdbCommand, SIDELOAD_MAX_PAYLOAD, type AdbPacket } from "./types.js";
import { decodeUtf8 } from "./adb-packet.js";
import { AdbStream } from "./adb-stream.js";
import type { WebUsbTransport } from "../transport/webusb.js";

/**
 * Perform an ADB sideload over an already-connected ADB transport.
 *
 * @param transport - The USB transport
 * @param blob - The file to sideload
 * @param receivePacket - Function to read ADB packets from the transport
 * @param maxPayload - Maximum block size (default: 64KB)
 * @param onProgress - Optional progress callback
 */
export async function sideload(
  transport: WebUsbTransport,
  blob: Blob,
  receivePacket: () => Promise<AdbPacket>,
  maxPayload: number = SIDELOAD_MAX_PAYLOAD,
  onProgress?: SideloadProgressCallback,
): Promise<void> {
  const totalBlocks = Math.ceil(blob.size / maxPayload);
  const service = `sideload-host:${blob.size}:${maxPayload}`;

  log(`Sideload: ${blob.size} bytes, ${totalBlocks} blocks, maxPayload=${maxPayload}`);

  // Open the sideload stream
  const stream = await AdbStream.open(transport, service, receivePacket);

  // Send initial OKAY handshake
  await stream.sendOkay();

  try {
    // Block request loop
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Read block request from device (WRTE with ASCII block number)
      const packet = await receivePacket();

      if (packet.command === AdbCommand.Close) {
        log("Sideload: device closed stream");
        break;
      }

      if (packet.command !== AdbCommand.Write) {
        log(
          `Sideload: unexpected command 0x${packet.command.toString(16)}, skipping`,
        );
        continue;
      }

      const request = decodeUtf8(packet.payload).trim();

      // Check for completion
      if (request === "DONEDONE") {
        log("Sideload: DONEDONE received, transfer complete");
        // Send final OKAY
        await stream.sendOkay();
        break;
      }

      // Parse block number
      const blockNumber = parseInt(request, 10);
      if (isNaN(blockNumber)) {
        log(`Sideload: invalid block request "${request}", skipping`);
        await stream.sendOkay();
        continue;
      }

      // Calculate byte range for this block
      const offset = blockNumber * maxPayload;
      const end = Math.min(offset + maxPayload, blob.size);

      // Read the block from the blob
      const slice = blob.slice(offset, end);
      const blockData = new Uint8Array(await slice.arrayBuffer());

      // Send OKAY to acknowledge the request
      await stream.sendOkay();

      // Send the block data via WRTE
      await stream.write(blockData, receivePacket);

      // Report progress
      onProgress?.(blockNumber + 1, totalBlocks);
    }
  } finally {
    await stream.close();
  }

  log("Sideload complete");
}
