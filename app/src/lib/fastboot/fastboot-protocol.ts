/**
 * Low-level fastboot protocol implementation.
 *
 * Handles sending commands, reading responses, and transferring data
 * over the WebUSB transport layer using the fastboot protocol.
 *
 * Protocol:
 *  - Commands: ASCII string sent via bulk OUT (max 4096 bytes)
 *  - Responses: 4-byte status prefix (OKAY/FAIL/DATA/INFO) + message via bulk IN
 *  - Data transfer: download command → DATA response → raw bytes → OKAY
 */

import { ProtocolError, type ProgressCallback, log } from "../types.js";
import type { WebUsbTransport } from "../transport/webusb.js";
import {
  FastbootResponse,
  type FastbootResult,
  FASTBOOT_COMMAND_TIMEOUT_MS,
} from "./types.js";

const RESPONSE_PREFIX_LEN = 4;
const MAX_RESPONSE_SIZE = 4096;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Send a fastboot command string to the device.
 */
export async function sendCommand(
  transport: WebUsbTransport,
  command: string,
  timeoutMs: number = FASTBOOT_COMMAND_TIMEOUT_MS,
): Promise<FastbootResult> {
  log(`fastboot > ${command}`);

  const encoded = textEncoder.encode(command);
  await transport.sendWithTimeout(encoded, timeoutMs);

  return readResponse(transport, timeoutMs);
}

/**
 * Read a fastboot response, consuming any INFO messages along the way.
 * Returns the final OKAY, FAIL, or DATA response.
 */
export async function readResponse(
  transport: WebUsbTransport,
  timeoutMs: number = FASTBOOT_COMMAND_TIMEOUT_MS,
): Promise<FastbootResult> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await transport.readTransferWithTimeout(
      MAX_RESPONSE_SIZE,
      timeoutMs,
    );

    const result = parseResponse(data);
    log(`fastboot < ${result.status} ${result.message}`);

    // INFO responses are intermediate status messages — log and continue
    if (result.status === FastbootResponse.Info) {
      continue;
    }

    // FAIL responses become a ProtocolError
    if (result.status === FastbootResponse.Fail) {
      throw new ProtocolError(`Fastboot command failed: ${result.message}`, {
        bootloaderMessage: result.message,
      });
    }

    return result;
  }
}

/**
 * Send raw data to the device in chunks with progress reporting.
 * Used after receiving a DATA response to a download command.
 */
export async function sendData(
  transport: WebUsbTransport,
  data: Uint8Array,
  onProgress?: ProgressCallback,
  chunkSize: number = 512 * 1024,
  timeoutMs: number = FASTBOOT_COMMAND_TIMEOUT_MS,
): Promise<void> {
  const total = data.byteLength;
  let offset = 0;

  while (offset < total) {
    const end = Math.min(offset + chunkSize, total);
    const chunk = data.subarray(offset, end);
    await transport.sendWithTimeout(chunk, timeoutMs);
    offset = end;
    onProgress?.(offset, total);

    // Yield to the browser event loop between chunks so Chrome's USB
    // stack can process completion events and hardware ACKs. Without
    // this, back-to-back transferOut calls can starve the USB driver's
    // completion handler, causing the device to miss data.
    if (offset < total) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

/**
 * Download a blob to the device memory (download command + data transfer).
 * This does NOT flash — call flashPartition() after downloading.
 */
export async function downloadData(
  transport: WebUsbTransport,
  data: Uint8Array,
  onProgress?: ProgressCallback,
  timeoutMs: number = FASTBOOT_COMMAND_TIMEOUT_MS,
): Promise<void> {
  const sizeHex = data.byteLength.toString(16).padStart(8, "0");
  const command = `download:${sizeHex}`;

  log(`fastboot > ${command} (${data.byteLength} bytes)`);
  const encoded = textEncoder.encode(command);
  await transport.sendWithTimeout(encoded, timeoutMs);

  // Expect DATA response with the size
  const response = await readResponse(transport, timeoutMs);
  if (response.status !== FastbootResponse.Data) {
    throw new ProtocolError(
      `Expected DATA response for download, got ${response.status}: ${response.message}`,
    );
  }

  // Send the raw data
  await sendData(transport, data, onProgress, 512 * 1024, timeoutMs);

  // Let the device fully process the received data before we issue a
  // USB IN transfer for the OKAY response. Chrome's async transferOut
  // resolves when the host controller accepts the data, but the device
  // may still be DMA-ing the last packets. Issuing transferIn too early
  // can cause some bootloaders (Qualcomm ABL) to miss the response.
  await new Promise((resolve) => setTimeout(resolve, 250));

  // Read final OKAY
  await readResponse(transport, timeoutMs);
}

/**
 * Flash the previously downloaded data to a partition.
 */
export async function flashPartition(
  transport: WebUsbTransport,
  partition: string,
  timeoutMs: number = FASTBOOT_COMMAND_TIMEOUT_MS,
): Promise<void> {
  await sendCommand(transport, `flash:${partition}`, timeoutMs);
}

/**
 * Erase a partition.
 */
export async function erasePartition(
  transport: WebUsbTransport,
  partition: string,
  timeoutMs: number = FASTBOOT_COMMAND_TIMEOUT_MS,
): Promise<void> {
  await sendCommand(transport, `erase:${partition}`, timeoutMs);
}

/**
 * Get a bootloader variable value.
 */
export async function getVariable(
  transport: WebUsbTransport,
  name: string,
  timeoutMs: number = FASTBOOT_COMMAND_TIMEOUT_MS,
): Promise<string> {
  const result = await sendCommand(
    transport,
    `getvar:${name}`,
    timeoutMs,
  );
  return result.message;
}

// ---- Internal Helpers ----

/**
 * Parse a raw fastboot response buffer into a structured result.
 */
function parseResponse(data: Uint8Array): FastbootResult {
  if (data.byteLength < RESPONSE_PREFIX_LEN) {
    throw new ProtocolError(
      `Fastboot response too short: ${data.byteLength} bytes`,
    );
  }

  const prefix = textDecoder.decode(data.subarray(0, RESPONSE_PREFIX_LEN));
  const message = textDecoder.decode(data.subarray(RESPONSE_PREFIX_LEN)).trim();

  switch (prefix) {
    case FastbootResponse.Okay:
      return { status: FastbootResponse.Okay, message };

    case FastbootResponse.Fail:
      return { status: FastbootResponse.Fail, message };

    case FastbootResponse.Info:
      return { status: FastbootResponse.Info, message };

    case FastbootResponse.Data: {
      // DATA response: the message is a hex string representing the data size
      const dataSize = parseInt(message, 16);
      return { status: FastbootResponse.Data, message, dataSize };
    }

    default:
      throw new ProtocolError(`Unknown fastboot response prefix: "${prefix}"`);
  }
}
