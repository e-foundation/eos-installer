/**
 * High-level Fastboot device interface.
 *
 * Provides the public API for connecting to a device in bootloader/fastboot
 * mode and performing operations like flashing, erasing, and rebooting.
 * Handles sparse image detection and splitting transparently.
 */

import {
  type ProgressCallback,
  UsbError,
  log,
} from "../types.js";
import { WebUsbTransport } from "../transport/webusb.js";
import { FASTBOOT_USB_FILTER } from "../transport/types.js";
import {
  sendCommand,
  downloadData,
  flashPartition,
  erasePartition,
  getVariable as getVar,
} from "./fastboot-protocol.js";
import { isSparseImage, splitSparseImage } from "./sparse-image.js";
import { FASTBOOT_COMMAND_TIMEOUT_MS, FASTBOOT_FLASH_TIMEOUT_MS } from "./types.js";

export class FastbootDevice {
  private _transport: WebUsbTransport;
  private _connected = false;
  private _maxDownloadSize: number | null = null;

  private constructor(transport: WebUsbTransport) {
    this._transport = transport;
  }

  // ---- Static Factory Methods ----

  /**
   * Prompt the user to select a fastboot device.
   * Requires a user gesture (click/tap).
   */
  static async requestDevice(): Promise<FastbootDevice> {
    const transport = await WebUsbTransport.requestDevice(FASTBOOT_USB_FILTER);
    return new FastbootDevice(transport);
  }

  /**
   * Find an already-paired fastboot device without user gesture.
   * Returns null if no paired fastboot device is found.
   */
  static async findDevice(): Promise<FastbootDevice | null> {
    const transport = await WebUsbTransport.findDevice(FASTBOOT_USB_FILTER);
    if (!transport) return null;
    return new FastbootDevice(transport);
  }

  // ---- Connection ----

  /**
   * Open the USB connection and verify the device speaks fastboot.
   */
  async connect(): Promise<void> {
    if (this._connected) return;

    await this._transport.open();

    // Verify fastboot protocol with a handshake
    try {
      const version = await getVar(this._transport, "version");
      log(`Fastboot connected, protocol version: ${version}`);
    } catch {
      // Some devices don't support getvar:version, that's okay
      log("Fastboot connected (version query not supported)");
    }

    this._connected = true;
  }

  /**
   * Close the USB connection.
   */
  async disconnect(): Promise<void> {
    if (!this._connected) return;
    await this._transport.close();
    this._connected = false;
    this._maxDownloadSize = null;
  }

  // ---- Commands ----

  /**
   * Get a bootloader variable (e.g., "version", "product", "unlocked").
   */
  async getVariable(name: string): Promise<string> {
    this.ensureConnected();
    return getVar(this._transport, name);
  }

  /**
   * Run an arbitrary fastboot command and return the response message.
   * Used for commands like "flashing unlock", "oem unlock", "flashing lock", etc.
   */
  async runCommand(command: string): Promise<string> {
    this.ensureConnected();
    const result = await sendCommand(this._transport, command);
    return result.message;
  }

  /**
   * Flash a blob to a partition.
   *
   * Automatically detects sparse images and splits them if they exceed
   * the device's max-download-size. Reports progress via callback.
   */
  async flashBlob(
    partition: string,
    blob: Blob,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    this.ensureConnected();

    // Read the first few bytes to check for sparse format
    const headerBytes = new Uint8Array(
      await blob.slice(0, 4).arrayBuffer(),
    );

    if (isSparseImage(headerBytes)) {
      await this.flashSparseBlob(partition, blob, onProgress);
    } else {
      await this.flashRawBlob(partition, blob, onProgress);
    }
  }

  /**
   * Erase a partition.
   */
  async erase(partition: string): Promise<void> {
    this.ensureConnected();
    await erasePartition(this._transport, partition);
  }

  /**
   * Boot a blob without flashing (fastboot boot).
   */
  async bootBlob(blob: Blob): Promise<void> {
    this.ensureConnected();
    const data = new Uint8Array(await blob.arrayBuffer());
    await downloadData(this._transport, data);
    await sendCommand(this._transport, "boot");
  }

  /**
   * Reboot the device.
   * @param mode - "" for normal, "bootloader" for fastboot, "recovery", etc.
   */
  async reboot(mode?: string): Promise<void> {
    this.ensureConnected();
    const command = mode ? `reboot-${mode}` : "reboot";
    try {
      await sendCommand(this._transport, command, 5000);
    } catch {
      // Reboot often causes USB disconnect before response arrives
      log(`Reboot command sent (${command}), device may have disconnected`);
    }
    this._connected = false;
  }

  /**
   * Reset the underlying USB device.
   */
  async resetDevice(): Promise<void> {
    await this._transport.reset();
  }

  /**
   * Close and re-open the USB connection for a fresh session.
   */
  async reconnect(): Promise<void> {
    this._connected = false;
    this._maxDownloadSize = null;
    await this._transport.reconnect();
    this._connected = true;
  }

  // ---- Getters ----

  get isConnected(): boolean {
    return this._connected;
  }

  get usbDevice(): USBDevice {
    return this._transport.device;
  }

  // ---- Private Helpers ----

  private ensureConnected(): void {
    if (!this._connected) {
      throw new UsbError("Fastboot device not connected");
    }
  }

  /**
   * Get and cache the device's max-download-size.
   * Falls back to 512 MB if the variable is not available.
   */
  private async getMaxDownloadSize(): Promise<number> {
    if (this._maxDownloadSize !== null) return this._maxDownloadSize;

    try {
      const value = await getVar(this._transport, "max-download-size");
      this._maxDownloadSize = parseInt(value, 16) || parseInt(value, 10);
      if (isNaN(this._maxDownloadSize) || this._maxDownloadSize <= 0) {
        this._maxDownloadSize = 512 * 1024 * 1024;
      }
    } catch {
      // Default to 512 MB
      this._maxDownloadSize = 512 * 1024 * 1024;
    }

    log(`Max download size: ${this._maxDownloadSize} bytes`);
    return this._maxDownloadSize;
  }

  /**
   * Flash a raw (non-sparse) blob: download + flash.
   */
  private async flashRawBlob(
    partition: string,
    blob: Blob,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    const data = new Uint8Array(await blob.arrayBuffer());
    await downloadData(this._transport, data, onProgress, FASTBOOT_FLASH_TIMEOUT_MS);
    await flashPartition(this._transport, partition, FASTBOOT_FLASH_TIMEOUT_MS);
  }

  /**
   * Flash a sparse blob: split if needed, then download + flash each sub-image.
   */
  private async flashSparseBlob(
    partition: string,
    blob: Blob,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    const maxSize = await this.getMaxDownloadSize();
    const subImages = await splitSparseImage(blob, maxSize);

    log(
      `Flashing sparse image to ${partition}: ` +
        `${subImages.length} sub-image(s), total ${blob.size} bytes`,
    );

    const totalSize = subImages.reduce((sum, img) => sum + img.size, 0);
    let sentSoFar = 0;

    for (let i = 0; i < subImages.length; i++) {
      const subImage = subImages[i];
      const data = new Uint8Array(await subImage.arrayBuffer());
      const subImageSize = data.byteLength;

      await downloadData(
        this._transport,
        data,
        (sent) => {
          onProgress?.(sentSoFar + sent, totalSize);
        },
        FASTBOOT_FLASH_TIMEOUT_MS,
      );

      await flashPartition(this._transport, partition, FASTBOOT_FLASH_TIMEOUT_MS);
      sentSoFar += subImageSize;

      log(
        `Sparse sub-image ${i + 1}/${subImages.length} flashed ` +
          `(${subImageSize} bytes)`,
      );
    }
  }
}
