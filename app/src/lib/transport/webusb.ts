/**
 * WebUSB transport layer.
 *
 * Handles device discovery, USB interface claiming, and raw bulk transfers.
 * Both ADB and Fastboot protocols build on top of this transport.
 */

import { TimeoutError, UsbError, log } from "../types.js";
import {
  DEFAULT_TIMEOUT_MS,
  type EndpointInfo,
} from "./types.js";

/**
 * Size of the internal buffer used for USB transferIn calls.
 * Must be large enough to hold any single USB transfer the device might send.
 * ADB and Fastboot both send packets well under 16 KB.
 */
const USB_RECEIVE_BUFFER_SIZE = 16384;

export class WebUsbTransport {
  private _device: USBDevice;
  private _inEndpoint = 0;
  private _outEndpoint = 0;
  private _interfaceNumber = 0;
  private _opened = false;
  private _filter: USBDeviceFilter;

  /** Internal buffer for excess bytes received from USB transfers. */
  private _rxBuf: Uint8Array = new Uint8Array(0);

  private constructor(device: USBDevice, filter: USBDeviceFilter) {
    this._device = device;
    this._filter = filter;
  }

  // ---- Static Factory Methods ----

  /**
   * Prompt the user to select a USB device matching the given filter.
   * Requires a user gesture (click/tap) in the browser.
   */
  static async requestDevice(
    filter: USBDeviceFilter,
  ): Promise<WebUsbTransport> {
    try {
      const device = await navigator.usb.requestDevice({
        filters: [filter],
      });
      return new WebUsbTransport(device, filter);
    } catch (e) {
      throw new UsbError(
        `Failed to request USB device: ${(e as Error).message || e}`,
        e,
      );
    }
  }

  /**
   * Find an already-paired USB device matching the filter.
   * Does not require a user gesture.
   */
  static async findDevice(
    filter: USBDeviceFilter,
  ): Promise<WebUsbTransport | null> {
    const devices = await navigator.usb.getDevices();
    for (const device of devices) {
      if (WebUsbTransport.matchesFilter(device, filter)) {
        return new WebUsbTransport(device, filter);
      }
    }
    return null;
  }

  /**
   * Get all paired USB devices matching the filter.
   */
  static async getDevices(filter: USBDeviceFilter): Promise<USBDevice[]> {
    const devices = await navigator.usb.getDevices();
    return devices.filter((d) => WebUsbTransport.matchesFilter(d, filter));
  }

  // ---- Connection Management ----

  /**
   * Open the device, select configuration, claim interface, and find endpoints.
   */
  async open(): Promise<void> {
    if (this._opened) return;

    try {
      await this._device.open();

      // Select configuration (usually configuration 1)
      if (this._device.configuration === null) {
        await this._device.selectConfiguration(1);
      }

      // Find the matching interface and endpoints
      const endpoints = this.findEndpoints();
      this._inEndpoint = endpoints.inEndpoint;
      this._outEndpoint = endpoints.outEndpoint;
      this._interfaceNumber = endpoints.interfaceNumber;

      // Claim the interface
      await this._device.claimInterface(this._interfaceNumber);

      // Clear any stale halt condition on both endpoints.
      // Previous sessions that were interrupted (tab closed, USB unplugged)
      // can leave endpoints in a HALTED state, causing every subsequent
      // transferIn/transferOut to fail with "A transfer error has occurred".
      try {
        await this._device.clearHalt("in", this._inEndpoint);
      } catch {
        // clearHalt may fail if endpoint isn't halted — that's fine
      }
      try {
        await this._device.clearHalt("out", this._outEndpoint);
      } catch {
        // clearHalt may fail if endpoint isn't halted — that's fine
      }

      this._rxBuf = new Uint8Array(0);
      this._opened = true;
      log(
        `Transport opened: ${this.productName} ` +
          `(in=${this._inEndpoint}, out=${this._outEndpoint}, ` +
          `iface=${this._interfaceNumber})`,
      );
    } catch (e) {
      throw new UsbError(
        `Failed to open USB device: ${(e as Error).message || e}`,
        e,
      );
    }
  }

  /**
   * Release the interface and close the device.
   */
  async close(): Promise<void> {
    if (!this._opened) return;

    try {
      await this._device.releaseInterface(this._interfaceNumber);
      await this._device.close();
    } catch (e) {
      log(`Close warning: ${(e as Error).message || e}`);
    } finally {
      this._opened = false;
      this._rxBuf = new Uint8Array(0);
    }
  }

  /**
   * Reset the USB device. May help recover from stale state.
   */
  async reset(): Promise<void> {
    try {
      await this._device.reset();
      log("USB device reset");
    } catch (e) {
      throw new UsbError(
        `USB device reset failed: ${(e as Error).message || e}`,
        e,
      );
    }
  }

  /**
   * Close and re-open the USB connection for a fresh session.
   * Useful for recovering from degraded USB state (e.g., after flash timeouts).
   */
  async reconnect(settleMs = 2000): Promise<void> {
    log("Reconnecting USB session...");
    await this.close();

    // Wait for USB bus to stabilize
    await new Promise((resolve) => setTimeout(resolve, settleMs));

    // Re-open the connection
    await this.open();
    log("USB session reconnected");
  }

  /**
   * Discard any buffered receive data. Call after a mode switch or error
   * recovery to avoid reading stale bytes.
   */
  flushReceiveBuffer(): void {
    this._rxBuf = new Uint8Array(0);
  }

  // ---- Data Transfer ----

  /**
   * Send raw bytes to the device via bulk OUT transfer.
   */
  async send(data: Uint8Array): Promise<void> {
    if (!this._opened) {
      throw new UsbError("Transport not open");
    }

    const result = await this._device.transferOut(this._outEndpoint, data as BufferSource);
    if (result.status !== "ok") {
      throw new UsbError(`USB transferOut failed: status=${result.status}`);
    }
  }

  /**
   * Receive exactly `length` bytes from the device.
   *
   * Uses an internal buffer so that USB transfers can be read with a large
   * buffer (preventing overflow errors when the device sends more bytes than
   * requested) and excess bytes are kept for subsequent reads.
   *
   * Use this for protocols that frame messages with known lengths (ADB).
   */
  async receive(length: number): Promise<Uint8Array> {
    if (!this._opened) {
      throw new UsbError("Transport not open");
    }

    // Accumulate data until we have enough
    while (this._rxBuf.byteLength < length) {
      const fresh = await this.doTransferIn();
      if (fresh.byteLength === 0) {
        throw new UsbError("USB transferIn returned empty data");
      }
      const combined = new Uint8Array(this._rxBuf.byteLength + fresh.byteLength);
      combined.set(this._rxBuf, 0);
      combined.set(fresh, this._rxBuf.byteLength);
      this._rxBuf = combined;
    }

    // Return exactly the requested bytes, keep the rest buffered
    const result = this._rxBuf.slice(0, length);
    this._rxBuf = this._rxBuf.slice(length);
    return result;
  }

  /**
   * Read a single USB transfer (up to `maxLength` bytes).
   *
   * Does NOT wait until `maxLength` bytes arrive — returns whatever the
   * device sent in one transfer.  Use this for protocols with
   * variable-length, single-transfer responses (Fastboot).
   */
  async readTransfer(maxLength: number = USB_RECEIVE_BUFFER_SIZE): Promise<Uint8Array> {
    if (!this._opened) {
      throw new UsbError("Transport not open");
    }

    // Drain any leftover buffered data first
    if (this._rxBuf.byteLength > 0) {
      const take = Math.min(maxLength, this._rxBuf.byteLength);
      const result = this._rxBuf.slice(0, take);
      this._rxBuf = this._rxBuf.slice(take);
      return result;
    }

    return this.doTransferIn(maxLength);
  }

  /**
   * Receive exactly `length` bytes with a timeout.
   * Throws TimeoutError if the data does not arrive in time.
   */
  async receiveWithTimeout(
    length: number,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<Uint8Array> {
    return Promise.race([
      this.receive(length),
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new TimeoutError(
                `USB receive timed out after ${timeoutMs}ms`,
                timeoutMs,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  }

  /**
   * Read a single USB transfer with a timeout.
   */
  async readTransferWithTimeout(
    maxLength: number = USB_RECEIVE_BUFFER_SIZE,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<Uint8Array> {
    return Promise.race([
      this.readTransfer(maxLength),
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new TimeoutError(
                `USB receive timed out after ${timeoutMs}ms`,
                timeoutMs,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  }

  /**
   * Send bytes with a timeout.
   */
  async sendWithTimeout(
    data: Uint8Array,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ): Promise<void> {
    return Promise.race([
      this.send(data),
      new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new TimeoutError(
                `USB send timed out after ${timeoutMs}ms`,
                timeoutMs,
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  }

  // ---- Getters ----

  get device(): USBDevice {
    return this._device;
  }

  get isOpen(): boolean {
    return this._opened;
  }

  get productName(): string {
    return this._device.productName ?? "";
  }

  get serialNumber(): string {
    return this._device.serialNumber ?? "";
  }

  // ---- Private Helpers ----

  /**
   * Perform a single USB bulk IN transfer with a large buffer.
   */
  private async doTransferIn(
    bufferSize: number = USB_RECEIVE_BUFFER_SIZE,
  ): Promise<Uint8Array> {
    const result = await this._device.transferIn(this._inEndpoint, bufferSize);
    if (result.status !== "ok") {
      throw new UsbError(`USB transferIn failed: status=${result.status}`);
    }
    if (!result.data || result.data.byteLength === 0) {
      return new Uint8Array(0);
    }
    return new Uint8Array(
      result.data.buffer,
      result.data.byteOffset,
      result.data.byteLength,
    );
  }

  /**
   * Find IN and OUT bulk endpoints matching the configured USB filter.
   */
  private findEndpoints(): EndpointInfo {
    const config = this._device.configuration;
    if (!config) {
      throw new UsbError("No USB configuration selected");
    }

    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        // Match the filter criteria
        const classMatch =
          this._filter.classCode === undefined ||
          alt.interfaceClass === this._filter.classCode;
        const subclassMatch =
          this._filter.subclassCode === undefined ||
          alt.interfaceSubclass === this._filter.subclassCode;
        const protocolMatch =
          this._filter.protocolCode === undefined ||
          alt.interfaceProtocol === this._filter.protocolCode;

        if (classMatch && subclassMatch && protocolMatch) {
          let inEndpoint = -1;
          let outEndpoint = -1;

          for (const ep of alt.endpoints) {
            if (ep.type !== "bulk") continue;
            if (ep.direction === "in") {
              inEndpoint = ep.endpointNumber;
            } else if (ep.direction === "out") {
              outEndpoint = ep.endpointNumber;
            }
          }

          if (inEndpoint >= 0 && outEndpoint >= 0) {
            return {
              inEndpoint,
              outEndpoint,
              interfaceNumber: iface.interfaceNumber,
            };
          }
        }
      }
    }

    throw new UsbError(
      `No matching USB interface found for filter ` +
        `(class=0x${this._filter.classCode?.toString(16)}, ` +
        `subclass=0x${this._filter.subclassCode?.toString(16)}, ` +
        `protocol=0x${this._filter.protocolCode?.toString(16)})`,
    );
  }

  /**
   * Check if a USB device has at least one interface matching the filter.
   */
  private static matchesFilter(
    device: USBDevice,
    filter: USBDeviceFilter,
  ): boolean {
    // Check vendor/product ID filters
    if (filter.vendorId !== undefined && device.vendorId !== filter.vendorId) {
      return false;
    }
    if (
      filter.productId !== undefined &&
      device.productId !== filter.productId
    ) {
      return false;
    }

    // Check interface class filters
    if (
      filter.classCode !== undefined ||
      filter.subclassCode !== undefined ||
      filter.protocolCode !== undefined
    ) {
      const config = device.configuration;
      if (!config) return false;

      for (const iface of config.interfaces) {
        for (const alt of iface.alternates) {
          const classMatch =
            filter.classCode === undefined ||
            alt.interfaceClass === filter.classCode;
          const subclassMatch =
            filter.subclassCode === undefined ||
            alt.interfaceSubclass === filter.subclassCode;
          const protocolMatch =
            filter.protocolCode === undefined ||
            alt.interfaceProtocol === filter.protocolCode;

          if (classMatch && subclassMatch && protocolMatch) {
            return true;
          }
        }
      }
      return false;
    }

    return true;
  }
}
