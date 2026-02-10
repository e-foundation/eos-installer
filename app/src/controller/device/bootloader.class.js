import {
  FastbootDevice,
  TimeoutError,
  setLogLevel,
  LogLevel,
} from "../../lib/index.ts";
import { Device } from "./device.class.js";
import { WDebug } from "../../debug.js";

/**
 * wrap fastboot interactions
 * */
export class Bootloader extends Device {
  constructor() {
    super(null);
    this.fastboot = null;
  }

  async init() {
    setLogLevel(LogLevel.Debug);
  }

  reboot(mode) {
    return this.fastboot.reboot(mode);
  }

  runCommand(command, timeoutMs) {
    return this.fastboot.runCommand(command, timeoutMs);
  }

  isBootloader() {
    return true;
  }

  async connect() {
    const MAX_CONNECT_ATTEMPTS = 3;
    const CONNECT_RETRY_DELAY = 2000; // 2 seconds
    const connectStart = Date.now();

    WDebug.log(
      `Bootloader.connect() starting, maxAttempts=${MAX_CONNECT_ATTEMPTS}, ` +
        `retryDelay=${CONNECT_RETRY_DELAY}ms`,
    );

    for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
      try {
        // Log paired devices before each attempt for debugging
        const pairedDevices = await navigator.usb.getDevices();
        WDebug.log(
          `Bootloader.connect() attempt ${attempt}/${MAX_CONNECT_ATTEMPTS}: ` +
            `${pairedDevices.length} paired USB device(s)`,
          pairedDevices.map(
            (d) => `${d.vendorId}:${d.productId} "${d.productName}"`,
          ),
        );

        // On first attempt or after a failed reconnect, create a new device
        if (!this.fastboot) {
          this.fastboot = await FastbootDevice.requestDevice();
        } else if (this.fastboot.isConnected) {
          // Existing connection — verify it's still alive (device may have
          // rebooted after unlock). A stale session would short-circuit
          // connect() but fail on the first real transfer.
          try {
            await this.fastboot.getVariable("version");
            WDebug.log(
              `Bootloader.connect() existing connection verified in ${Date.now() - connectStart}ms`,
            );
            return;
          } catch {
            WDebug.log(
              "Bootloader.connect() existing connection stale, reconnecting...",
            );
            try {
              await this.fastboot.disconnect();
            } catch {
              /* ignore */
            }
            this.fastboot = await FastbootDevice.findDevice();
            if (!this.fastboot) {
              // No paired device found — need user gesture
              this.fastboot = await FastbootDevice.requestDevice();
            }
          }
        }
        await this.fastboot.connect();

        const elapsed = Date.now() - connectStart;
        WDebug.log(
          `Bootloader.connect() succeeded on attempt ${attempt} after ${elapsed}ms`,
        );
        return;
      } catch (e) {
        const errorMsg = e.message || String(e);
        const elapsed = Date.now() - connectStart;
        WDebug.log(
          `Bootloader.connect() attempt ${attempt} failed after ${elapsed}ms: ${errorMsg}`,
        );

        // If this is the last attempt, throw the error
        if (attempt === MAX_CONNECT_ATTEMPTS) {
          throw new Error(
            `Cannot connect to bootloader after ${MAX_CONNECT_ATTEMPTS} attempts. ` +
              `The device may not be in bootloader mode yet. ` +
              `Please ensure the device is in bootloader/fastboot mode and try again. ` +
              `Error: ${errorMsg}`,
          );
        }

        // Wait before retry, with increasing delay
        const delay = CONNECT_RETRY_DELAY * attempt;
        WDebug.log(
          `Bootloader.connect() waiting ${delay}ms before attempt ${attempt + 1}...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Try to reset USB device to clear stale state
        if (this.fastboot) {
          WDebug.log("Bootloader.connect() attempting USB device reset...");
          try {
            await this.fastboot.resetDevice();
            WDebug.log("Bootloader.connect() USB device reset succeeded");
          } catch (resetErr) {
            WDebug.log(
              `Bootloader.connect() USB device reset failed: ${resetErr.message || resetErr}`,
            );
            this.fastboot = null; // Force new device on next attempt
          }
        }
      }
    }
  }

  getProductName() {
    return this.fastboot?.usbDevice?.productName;
  }

  getSerialNumber() {
    return this.fastboot?.usbDevice?.serialNumber;
  }

  /**
   * Close the USB device and re-establish a fresh connection.
   * This is more thorough than resetDevice() and helps recover from
   * degraded USB sessions (e.g., AMD Ryzen + Mediatek).
   */
  async reconnectDevice() {
    if (!this.fastboot) {
      WDebug.log("reconnectDevice: no fastboot device reference, skipping");
      return;
    }

    WDebug.log("reconnectDevice: reconnecting USB session...");
    try {
      await this.fastboot.reconnect();
      WDebug.log(
        `reconnectDevice: connection re-established, isConnected=${this.fastboot.isConnected}`,
      );
    } catch (e) {
      WDebug.log(`reconnectDevice: reconnect failed: ${e.message || e}`);
      throw e;
    }
  }

  async flashBlob(partition, blob, onProgress, attempt = 1) {
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 5000; // Wait before retry to let device stabilize
    const flashStart = Date.now();

    // Pre-flash check: ensure device is still connected
    if (!this.fastboot?.isConnected) {
      throw new Error(`Device disconnected before flashing ${partition}`);
    }

    try {
      WDebug.log(
        `flashBlob: ${partition} (${(blob.size / 1024 / 1024).toFixed(1)} MB), ` +
          `attempt ${attempt}/${MAX_ATTEMPTS}`,
      );
      await this.fastboot.flashBlob(partition, blob, (sent, total) => {
        onProgress(sent, total, partition);
      });
      onProgress(blob.size, blob.size, partition);
      const elapsed = Date.now() - flashStart;
      WDebug.log(`flashBlob: ${partition} succeeded in ${elapsed}ms`);
      return true;
    } catch (e) {
      if (e instanceof TimeoutError) {
        const elapsed = Date.now() - flashStart;
        WDebug.log(
          `flashBlob: timeout on ${partition} after ${elapsed}ms ` +
            `(attempt ${attempt}/${MAX_ATTEMPTS})`,
        );
        if (attempt < MAX_ATTEMPTS) {
          WDebug.log(`flashBlob: waiting ${RETRY_DELAY_MS}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

          // Try to reset USB device to clear stale state
          WDebug.log("flashBlob: attempting USB device reset...");
          try {
            await this.fastboot.resetDevice();
            WDebug.log("flashBlob: USB device reset succeeded");
          } catch (resetErr) {
            WDebug.log(
              `flashBlob: USB device reset failed: ${resetErr.message || resetErr}`,
            );
          }

          // Reconnect for a fresh USB session
          WDebug.log("flashBlob: reconnecting for fresh USB session...");
          try {
            await this.reconnectDevice();
          } catch (reconnErr) {
            WDebug.log(
              `flashBlob: reconnect failed: ${reconnErr.message || reconnErr}`,
            );
          }

          // Check if device is still connected before retry
          if (!this.fastboot?.isConnected) {
            throw new Error(
              `Device disconnected during flash of ${partition}. Please reconnect and try again.`,
            );
          }

          return await this.flashBlob(partition, blob, onProgress, attempt + 1);
        }
        throw new Error(
          `Bootloader timeout: flashing ${partition} failed after ${MAX_ATTEMPTS} attempts. ` +
            `Try using a different USB port or cable.`,
        );
      } else {
        console.log("flashBlob error", e);
        throw new Error(`Bootloader error: ${e.message || e}`);
      }
    }
  }

  bootBlob(blob) {
    return this.fastboot.bootBlob(blob);
  }

  async isUnlocked(variable) {
    if (this.fastboot?.isConnected) {
      try {
        const unlocked = await this.fastboot.getVariable(variable);
        return !(!unlocked || unlocked === "no");
      } catch (e) {
        console.error("isUnlocked check failed:", e);
        throw e;
      }
    }
    return false;
  }

  async isLocked(variable) {
    if (this.fastboot?.isConnected) {
      try {
        const unlocked = await this.fastboot.getVariable(variable);
        return !unlocked || unlocked === "no";
      } catch (e) {
        console.error("isLocked check failed:", e);
        throw e;
      }
    }
    return false;
  }

  async unlock(command) {
    if (command) {
      await this.fastboot.runCommand(command);
    } else {
      throw new Error("No unlock command configured for this device");
    }
  }

  async lock(command) {
    if (command) {
      await this.fastboot.runCommand(command);
      return !(await this.isUnlocked());
    } else {
      throw new Error("No lock command configured for this device");
    }
  }
}
