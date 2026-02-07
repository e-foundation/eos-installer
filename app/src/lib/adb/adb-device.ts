/**
 * High-level ADB device interface.
 *
 * Provides the public API for connecting to a device in ADB mode,
 * executing shell commands, reading properties, and performing sideloads.
 * Handles the full CNXN/AUTH handshake including RSA key management.
 */

import {
  ProtocolError,
  UsbError,
  type DeviceBanner,
  type SideloadProgressCallback,
  log,
  logError,
} from "../types.js";
import { WebUsbTransport } from "../transport/webusb.js";
import { ADB_USB_FILTER } from "../transport/types.js";
import { DEFAULT_TIMEOUT_MS } from "../transport/types.js";
import {
  AdbCommand,
  ADB_VERSION,
  ADB_MAX_PAYLOAD,
  AdbAuthType,
  type AdbPacket,
} from "./types.js";
import {
  writePacket,
  readPacket,
  decodeUtf8,
} from "./adb-packet.js";
import {
  BrowserAdbCredentialStore,
  signToken,
  exportPublicKey,
  type AdbCredentialStore,
} from "./adb-auth.js";
import { AdbStream } from "./adb-stream.js";
import { sideload as performSideload } from "./adb-sideload.js";

export class AdbDevice {
  private _transport: WebUsbTransport;
  private _connected = false;
  private _banner: DeviceBanner = { device: "", model: "", product: "" };
  private _credentialStore: AdbCredentialStore;

  private constructor(
    transport: WebUsbTransport,
    credentialStore?: AdbCredentialStore,
  ) {
    this._transport = transport;
    this._credentialStore =
      credentialStore ?? new BrowserAdbCredentialStore();
  }

  // ---- Static Factory Methods ----

  /**
   * Prompt the user to select an ADB device.
   * Requires a user gesture (click/tap).
   */
  static async requestDevice(
    credentialStore?: AdbCredentialStore,
  ): Promise<AdbDevice> {
    const transport = await WebUsbTransport.requestDevice(ADB_USB_FILTER);
    return new AdbDevice(transport, credentialStore);
  }

  /**
   * Find an already-paired ADB device without user gesture.
   * Returns null if no paired ADB device is found.
   */
  static async findDevice(
    credentialStore?: AdbCredentialStore,
  ): Promise<AdbDevice | null> {
    const transport = await WebUsbTransport.findDevice(ADB_USB_FILTER);
    if (!transport) return null;
    return new AdbDevice(transport, credentialStore);
  }

  // ---- Connection ----

  /**
   * Open the USB connection and perform the ADB handshake (CNXN + AUTH).
   */
  async connect(): Promise<void> {
    if (this._connected) return;

    await this._transport.open();

    // Send CNXN (header + payload as separate USB transfers)
    const sendFn = (data: Uint8Array) =>
      this._transport.sendWithTimeout(data, DEFAULT_TIMEOUT_MS);
    await writePacket(
      sendFn,
      AdbCommand.Connect,
      ADB_VERSION,
      ADB_MAX_PAYLOAD,
      `host::\0`,
    );

    log("ADB CNXN sent, waiting for response...");

    // Read response
    const response = await this.receivePacket();

    if (response.command === AdbCommand.Connect) {
      // Direct connect (no auth required — device already trusts us)
      this.parseBanner(response.payload);
      this._connected = true;
      log("ADB connected (no auth required)", this._banner);
      return;
    }

    if (response.command === AdbCommand.Auth) {
      // Auth required — handle token challenge
      await this.handleAuth(response);
      this._connected = true;
      log("ADB connected (authenticated)", this._banner);
      return;
    }

    throw new ProtocolError(
      `Unexpected ADB response: command=0x${response.command.toString(16)}`,
    );
  }

  /**
   * Disconnect from the device.
   */
  async disconnect(): Promise<void> {
    if (!this._connected) return;
    await this._transport.close();
    this._connected = false;
  }

  // ---- Commands ----

  /**
   * Execute a shell command and return stdout as a string.
   */
  async shell(command: string): Promise<string> {
    this.ensureConnected();

    const stream = await AdbStream.open(
      this._transport,
      `shell:${command}`,
      () => this.receivePacket(),
    );

    let output = "";

    try {
      // Read all data until stream closes
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const packet = await this.receivePacket();

        // Skip packets for other streams (stale CLSE acks, etc.)
        if (packet.arg1 !== 0 && packet.arg1 !== stream.localId) {
          log(
            `Shell: skipping stale packet cmd=0x${packet.command.toString(16)} ` +
              `for localId=${packet.arg1} (ours=${stream.localId})`,
          );
          continue;
        }

        if (packet.command === AdbCommand.Write) {
          output += decodeUtf8(packet.payload);
          // Send OKAY to acknowledge
          await stream.sendOkay();
        } else if (packet.command === AdbCommand.Close) {
          break;
        } else if (packet.command === AdbCommand.Okay) {
          // Flow control, continue reading
          continue;
        } else {
          log(
            `Shell: unexpected command 0x${packet.command.toString(16)}`,
          );
          break;
        }
      }
    } finally {
      await stream.close();
    }

    return output.trim();
  }

  /**
   * Get a system property value (equivalent to `getprop <name>`).
   */
  async getProp(name: string): Promise<string> {
    return this.shell(`getprop ${name}`);
  }

  /**
   * Get the device serial number.
   */
  async getSerialNumber(): Promise<string> {
    return this.getProp("ro.boot.serialno");
  }

  /**
   * Reboot the device.
   * @param mode - "" for normal, "bootloader", "recovery", "fastboot", etc.
   */
  async reboot(mode?: string): Promise<void> {
    this.ensureConnected();

    const service = mode ? `reboot:${mode}` : "reboot:";

    try {
      const stream = await AdbStream.open(
        this._transport,
        service,
        () => this.receivePacket(),
      );
      await stream.close();
    } catch {
      // Reboot causes USB disconnect, so errors are expected
      log(`Reboot command sent (${mode || "normal"})`);
    }

    this._connected = false;
  }

  /**
   * Sideload a file to the device (must be in recovery mode).
   */
  async sideload(
    blob: Blob,
    onProgress?: SideloadProgressCallback,
  ): Promise<void> {
    this.ensureConnected();
    await performSideload(
      this._transport,
      blob,
      () => this.receivePacket(),
      undefined,
      onProgress,
    );
  }

  // ---- Getters ----

  get banner(): DeviceBanner {
    return { ...this._banner };
  }

  get isConnected(): boolean {
    return this._connected;
  }

  get usbDevice(): USBDevice {
    return this._transport.device;
  }

  // ---- Private ----

  private ensureConnected(): void {
    if (!this._connected) {
      throw new UsbError("ADB device not connected");
    }
  }

  /**
   * Read a complete ADB packet from the transport.
   */
  private async receivePacket(): Promise<AdbPacket> {
    return readPacket((length) =>
      this._transport.receiveWithTimeout(length, DEFAULT_TIMEOUT_MS),
    );
  }

  /**
   * Handle the ADB authentication handshake.
   *
   * Flow:
   *   1. Device sends AUTH with TOKEN type (20 random bytes)
   *   2. Try signing with each stored key → send AUTH SIGNATURE
   *   3. If accepted (CNXN), done
   *   4. If not, generate new key → send AUTH RSAPUBLICKEY → wait for user approval
   */
  private async handleAuth(authPacket: AdbPacket): Promise<void> {
    const token = authPacket.payload;

    // Try each stored key
    const keys = await this._credentialStore.getKeys();
    const sendFn = (data: Uint8Array) =>
      this._transport.sendWithTimeout(data, DEFAULT_TIMEOUT_MS);

    for (const keyPair of keys) {
      try {
        const signature = await signToken(keyPair.privateKey, token);
        await writePacket(
          sendFn,
          AdbCommand.Auth,
          AdbAuthType.Signature,
          0,
          signature,
        );

        const response = await this.receivePacket();
        if (response.command === AdbCommand.Connect) {
          this.parseBanner(response.payload);
          return;
        }
        // If AUTH again, try next key
      } catch (e) {
        logError("Auth signature attempt failed:", e);
      }
    }

    // No stored key worked — generate new key and send public key
    log("No stored key accepted, generating new key pair...");
    const newKeyPair = await this._credentialStore.generateKey();
    const publicKeyBytes = await exportPublicKey(newKeyPair.publicKey);

    await writePacket(
      sendFn,
      AdbCommand.Auth,
      AdbAuthType.RsaPublicKey,
      0,
      publicKeyBytes,
    );

    log("Public key sent, waiting for user approval on device...");

    // Wait for CNXN (user approves on device screen)
    // Use a longer timeout since user needs to interact with the device
    const response = await readPacket((length) =>
      this._transport.receiveWithTimeout(length, 60_000),
    );

    if (response.command !== AdbCommand.Connect) {
      throw new ProtocolError(
        "ADB authentication failed — user may have denied the connection on the device",
      );
    }

    this.parseBanner(response.payload);
  }

  /**
   * Parse the device banner from a CNXN payload.
   *
   * Banner format: "device::ro.product.name=XXX;ro.product.model=YYY;..."
   * Or simpler: "device::<features>"
   * The transport banner fields come from system properties sent during connect.
   */
  private parseBanner(payload: Uint8Array): void {
    const bannerStr = decodeUtf8(payload).replace(/\0/g, "");
    log(`ADB banner: "${bannerStr}"`);

    // Parse key-value pairs from the banner
    // Format: "device::prop1=val1;prop2=val2;..."
    const parts = bannerStr.split("::");
    const propsStr = parts.length > 1 ? parts[1] : "";

    const props = new Map<string, string>();
    for (const pair of propsStr.split(";")) {
      const [key, value] = pair.split("=", 2);
      if (key && value) {
        props.set(key.trim(), value.trim());
      }
    }

    this._banner = {
      device:
        props.get("ro.product.device") ||
        props.get("device") ||
        "",
      model:
        props.get("ro.product.model") ||
        props.get("model") ||
        "",
      product:
        props.get("ro.product.name") ||
        props.get("product") ||
        "",
    };
  }
}
