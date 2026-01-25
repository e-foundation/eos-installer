import {
  configureZip,
  FastbootDevice,
  setDebugLevel,
  TimeoutError,
  USER_ACTION_MAP,
} from "@e/fastboot";
import { Device } from "./device.class.js";
import { WDebug } from "../../debug.js";

/**
 * wrap fastboot interactions
 * */
export class Bootloader extends Device {
  constructor() {
    super(new FastbootDevice());
  }

  async init() {
    //await this.blobStore.init();
    configureZip({
      workerScripts: {
        inflate: ["/vendor/z-worker-pako.js", "pako_inflate.min.js"],
      },
    });
    // Enable verbose debug logging
    setDebugLevel(2);
  }

  reboot(mode) {
    return this.device.reboot(mode);
  }

  runCommand(command) {
    return this.device.runCommand(command);
  }

  isBootloader() {
    return true;
  }

  async connect() {
    const MAX_CONNECT_ATTEMPTS = 3;
    const CONNECT_RETRY_DELAY = 2000; // 2 seconds

    for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
      try {
        WDebug.log(`Connecting to bootloader (attempt ${attempt}/${MAX_CONNECT_ATTEMPTS})...`);
        await this.device.connect();
        WDebug.log(`Successfully connected to bootloader on attempt ${attempt}`);
        return;
      } catch (e) {
        const errorMsg = e.message || String(e);
        WDebug.log(`Bootloader connection attempt ${attempt} failed: ${errorMsg}`);

        // If this is the last attempt, throw the error
        if (attempt === MAX_CONNECT_ATTEMPTS) {
          throw new Error(
            `Cannot connect to bootloader after ${MAX_CONNECT_ATTEMPTS} attempts. ` +
            `The device may not be in bootloader mode yet. ` +
            `Please ensure the device is in bootloader/fastboot mode and try again. ` +
            `Error: ${errorMsg}`
          );
        }

        // Wait before retry, with increasing delay
        const delay = CONNECT_RETRY_DELAY * attempt;
        WDebug.log(`Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  getProductName() {
    return this.device.device.productName;
  }

  getSerialNumber() {
    return this.device.device.serialNumber;
  }

  async flashFactoryZip(blob, onProgress, onReconnect) {
    await this.device.flashFactoryZip(
      blob,
      false,
      onReconnect,
      // Progress callback
      (action, item, progress) => {
        let userAction = USER_ACTION_MAP[action];
        onProgress(userAction, item, progress);
      },
    );
  }

  async flashBlob(partition, blob, onProgress, attempt = 1) {
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 3000; // Wait before retry to let device stabilize

    // Pre-flash check: ensure device is still connected
    if (!this.device.isConnected) {
      throw new Error(`Device disconnected before flashing ${partition}`);
    }

    try {
      WDebug.log(
        `Flashing ${partition} (${(blob.size / 1024 / 1024).toFixed(1)} MB)...`,
      );
      await this.device.flashBlob(partition, blob, (progress) => {
        onProgress(progress * blob.size, blob.size, partition);
      });
      onProgress(blob.size, blob.size, partition);
      return true;
    } catch (e) {
      if (e instanceof TimeoutError) {
        WDebug.log(
          `Timeout on flashblob > ${partition} (attempt ${attempt}/${MAX_ATTEMPTS})`,
        );
        if (attempt < MAX_ATTEMPTS) {
          // Wait before retry to allow device to recover
          WDebug.log(`Waiting ${RETRY_DELAY_MS}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

          // Check if device is still connected before retry
          if (!this.device.isConnected) {
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
    return this.device.bootBlob(blob);
  }

  async isUnlocked(variable) {
    if (this.device && this.device.isConnected) {
      try {
        const unlocked = await this.device.getVariable(variable);
        return !(!unlocked || unlocked === "no");
      } catch (e) {
        console.error("isUnlocked check failed:", e);
        throw e;
      }
    }
    return false;
  }

  async isLocked(variable) {
    if (this.device && this.device.isConnected) {
      try {
        const unlocked = await this.device.getVariable(variable);
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
      await this.device.runCommand(command);
    } else {
      throw new Error("No unlock command configured for this device");
    }
  }

  async lock(command) {
    if (command) {
      await this.device.runCommand(command);
      return !(await this.isUnlocked());
    } else {
      throw new Error("No lock command configured for this device");
    }
  }
}
