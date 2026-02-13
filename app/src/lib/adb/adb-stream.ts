/**
 * ADB stream management.
 *
 * An ADB stream is a logical bidirectional channel opened over the ADB
 * connection for a specific service (e.g., "shell:ls", "sideload-host:...").
 *
 * Stream lifecycle:
 *   1. Host sends OPEN with local_id and service name
 *   2. Device responds with OKAY (remote_id, local_id) on success
 *   3. Data flows via WRTE/OKAY pairs
 *   4. Either side sends CLSE to close
 */

import {
  ProtocolError,
  log,
  DEFAULT_TIMEOUT_MS,
  type WebUsbTransport,
} from "@e/fastboot";
import { AdbCommand, type AdbPacket } from "./types.js";
import { writePacket, encodeUtf8 } from "./adb-packet.js";

let nextLocalId = 1;

export class AdbStream {
  readonly localId: number;
  remoteId: number;
  private _transport: WebUsbTransport;
  private _closed = false;

  constructor(transport: WebUsbTransport, localId: number, remoteId: number) {
    this._transport = transport;
    this.localId = localId;
    this.remoteId = remoteId;
  }

  /**
   * Open a new stream for a given service.
   *
   * @param transport - The USB transport
   * @param service - The ADB service string (e.g., "shell:ls", "sideload-host:1234:65536")
   * @param receivePacket - Function to read a packet from the transport
   * @returns A new AdbStream
   */
  static async open(
    transport: WebUsbTransport,
    service: string,
    receivePacket: () => Promise<AdbPacket>,
  ): Promise<AdbStream> {
    const localId = nextLocalId++;
    const sendFn = (data: Uint8Array) =>
      transport.sendWithTimeout(data, DEFAULT_TIMEOUT_MS);

    // Send OPEN (header + payload as separate USB transfers)
    await writePacket(
      sendFn,
      AdbCommand.Open,
      localId,
      0,
      encodeUtf8(service + "\0"),
    );

    log(`Stream OPEN: localId=${localId}, service="${service}"`);

    // Read response — expect OKAY.
    // Skip stale packets from previously closed streams (e.g., a CLSE
    // acknowledgment for a stream we already closed).
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const response = await receivePacket();

      // Packets for other streams have arg1 != our localId — skip them
      if (response.arg1 !== 0 && response.arg1 !== localId) {
        log(
          `Stream OPEN: skipping stale packet cmd=0x${response.command.toString(16)} ` +
            `for localId=${response.arg1} (ours=${localId})`,
        );
        continue;
      }

      if (response.command === AdbCommand.Okay) {
        const stream = new AdbStream(transport, localId, response.arg0);
        log(
          `Stream opened: localId=${localId}, remoteId=${stream.remoteId}`,
        );
        return stream;
      }

      if (response.command === AdbCommand.Close) {
        throw new ProtocolError(
          `ADB service "${service}" rejected (CLSE received)`,
        );
      }

      throw new ProtocolError(
        `Unexpected response to OPEN: command=0x${response.command.toString(16)}`,
      );
    }
  }

  /**
   * Write data to the remote end.
   * Sends WRTE and waits for OKAY acknowledgment.
   */
  async write(
    data: Uint8Array,
    receivePacket: () => Promise<AdbPacket>,
  ): Promise<void> {
    if (this._closed) {
      throw new ProtocolError("Cannot write to closed stream");
    }

    await writePacket(
      (d) => this._transport.sendWithTimeout(d, DEFAULT_TIMEOUT_MS),
      AdbCommand.Write,
      this.localId,
      this.remoteId,
      data,
    );

    // Wait for OKAY
    const response = await receivePacket();
    if (response.command === AdbCommand.Close) {
      this._closed = true;
      throw new ProtocolError("Stream closed by device during write");
    }
    if (response.command !== AdbCommand.Okay) {
      throw new ProtocolError(
        `Expected OKAY after WRTE, got 0x${response.command.toString(16)}`,
      );
    }
  }

  /**
   * Send an OKAY acknowledgment to the device.
   */
  async sendOkay(): Promise<void> {
    await writePacket(
      (d) => this._transport.sendWithTimeout(d, DEFAULT_TIMEOUT_MS),
      AdbCommand.Okay,
      this.localId,
      this.remoteId,
    );
  }

  /**
   * Close the stream.
   */
  async close(): Promise<void> {
    if (this._closed) return;

    try {
      await writePacket(
        (d) => this._transport.sendWithTimeout(d, 5000),
        AdbCommand.Close,
        this.localId,
        this.remoteId,
      );
    } catch {
      // Ignore errors when closing
    }
    this._closed = true;
  }

  get isClosed(): boolean {
    return this._closed;
  }
}
