/**
 * ADB packet encoding and decoding.
 *
 * Each ADB message consists of a 24-byte header followed by an optional
 * data payload. The header format (all little-endian uint32):
 *
 *   [command][arg0][arg1][data_length][data_checksum][magic]
 *
 * Where magic = command ^ 0xFFFFFFFF.
 */

import { ProtocolError } from "@e/fastboot";
import { ADB_HEADER_SIZE, type AdbPacket, type AdbCommand } from "./types.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Calculate the ADB checksum over a payload.
 * This is a simple unsigned sum of all bytes, masked to 32 bits.
 */
export function calculateChecksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.byteLength; i++) {
    sum = (sum + data[i]) >>> 0;
  }
  return sum;
}

/**
 * Encode an ADB packet header (24 bytes).
 *
 * IMPORTANT: ADB protocol requires the header and payload to be sent as
 * separate USB bulk transfers. The device reads them with distinct read()
 * calls on the USB endpoint.  Use {@link writePacket} to send correctly.
 */
export function encodeHeader(
  command: AdbCommand,
  arg0: number,
  arg1: number,
  dataLength: number,
  dataChecksum: number,
): Uint8Array {
  const magic = (command ^ 0xffffffff) >>> 0;
  const buf = new ArrayBuffer(ADB_HEADER_SIZE);
  const view = new DataView(buf);
  view.setUint32(0, command, true);
  view.setUint32(4, arg0, true);
  view.setUint32(8, arg1, true);
  view.setUint32(12, dataLength, true);
  view.setUint32(16, dataChecksum, true);
  view.setUint32(20, magic, true);
  return new Uint8Array(buf);
}

/**
 * Send an ADB packet over USB.
 *
 * Header and payload are written as **separate** USB bulk transfers,
 * which is required by the ADB protocol (adbd reads them individually).
 *
 * @param send  function that performs a single USB bulk OUT transfer
 */
export async function writePacket(
  send: (data: Uint8Array) => Promise<void>,
  command: AdbCommand,
  arg0: number,
  arg1: number,
  payload: Uint8Array | string = new Uint8Array(0),
): Promise<void> {
  const data =
    typeof payload === "string" ? textEncoder.encode(payload) : payload;
  const checksum = calculateChecksum(data);
  const header = encodeHeader(command, arg0, arg1, data.byteLength, checksum);

  await send(header);
  if (data.byteLength > 0) {
    await send(data);
  }
}

/**
 * Decode a 24-byte ADB packet header.
 * Returns the parsed header fields. The payload should be read separately
 * using the data_length field.
 */
export function decodeHeader(
  data: Uint8Array,
): { command: AdbCommand; arg0: number; arg1: number; dataLength: number; checksum: number } {
  if (data.byteLength < ADB_HEADER_SIZE) {
    throw new ProtocolError(
      `ADB header too short: ${data.byteLength} < ${ADB_HEADER_SIZE}`,
    );
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const command = view.getUint32(0, true) as AdbCommand;
  const magic = view.getUint32(20, true);

  // Validate magic
  if (((command ^ magic) >>> 0) !== 0xffffffff) {
    throw new ProtocolError(
      `ADB packet magic mismatch: command=0x${command.toString(16)}, ` +
        `magic=0x${magic.toString(16)}`,
    );
  }

  return {
    command,
    arg0: view.getUint32(4, true),
    arg1: view.getUint32(8, true),
    dataLength: view.getUint32(12, true),
    checksum: view.getUint32(16, true),
  };
}

/**
 * Read a complete ADB packet (header + payload) from a transport.
 * Uses the provided receive function to get raw bytes.
 */
export async function readPacket(
  receiveBytes: (length: number) => Promise<Uint8Array>,
): Promise<AdbPacket> {
  // Read the 24-byte header
  const headerBuf = await receiveBytes(ADB_HEADER_SIZE);
  const header = decodeHeader(headerBuf);

  // Read payload if present
  let payload: Uint8Array = new Uint8Array(0);
  if (header.dataLength > 0) {
    payload = await receiveBytes(header.dataLength) as Uint8Array;
  }

  return {
    command: header.command,
    arg0: header.arg0,
    arg1: header.arg1,
    payload,
  };
}

/**
 * Encode a string payload to UTF-8 bytes.
 */
export function encodeUtf8(str: string): Uint8Array {
  return textEncoder.encode(str);
}

/**
 * Decode UTF-8 bytes to a string.
 */
export function decodeUtf8(data: Uint8Array): string {
  return textDecoder.decode(data);
}
