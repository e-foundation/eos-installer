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

  isConnected() {
    return this.device.isConnected;
  }

  isBootloader() {
    return true;
  }

  async connect() {
    try {
      await this.device.connect();
    } catch (e) {
      throw new Error("Cannot connect Bootloader", `${e.message || e}`);
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

  async flashBlob(partition, blob, onProgress, retryCount = 0) {
    const MAX_RETRIES = 3;
    try {
      await this.device.flashBlob(partition, blob, (progress) => {
        onProgress(progress * blob.size, blob.size, partition);
      });
      onProgress(blob.size, blob.size, partition);
      return true;
    } catch (e) {
      if (e instanceof TimeoutError) {
        WDebug.log(`Timeout on flashblob > ${partition} (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        if (retryCount < MAX_RETRIES) {
          return await this.flashBlob(partition, blob, onProgress, retryCount + 1);
        }
        throw new Error(`Bootloader timeout: flashing ${partition} failed after ${MAX_RETRIES} retries`);
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
