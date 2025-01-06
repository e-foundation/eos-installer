import * as fastboot from "../../lib/fastboot/fastboot.js";
import { TimeoutError } from "../../lib/fastboot/fastboot.js";
import { Device } from "./device.class.js";
import { WDebug } from "../../debug.js";

/**
 * wrap fastboot interactions
 * */
export class Bootloader extends Device {
  constructor() {
    super(new fastboot.FastbootDevice());
  }

  async init() {
    //await this.blobStore.init();
    fastboot.configureZip({
      workerScripts: {
        inflate: ["../dist/vendor/z-worker-pako.js", "pako_inflate.min.js"],
      },
    });
    // Enable verbose debug logging
    fastboot.setDebugLevel(2);
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
        let userAction = fastboot.USER_ACTION_MAP[action];
        onProgress(userAction, item, progress);
      },
    );
  }

  async flashBlob(partition, blob, onProgress) {
    try {
      await this.device.flashBlob(partition, blob, (progress) => {
        onProgress(progress * blob.size, blob.size, partition);
      });
      onProgress(blob.size, blob.size, partition);
      return true;
    } catch (e) {
      if (e instanceof TimeoutError) {
        WDebug.log("Timeout on flashblob >" + partition);
        return await this.flashBlob(partition, blob, onProgress);
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
        console.error(e); // K1ZFP TODO
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
        console.error(e); //K1ZFP TODO
        throw e;
      }
    }
    return false;
  }

  async unlock(command) {
    if (command) {
      await this.device.runCommand(command);
    } else {
      throw Error("no unlock command configured"); //K1ZFP TODO
    }
  }

  async lock(command) {
    if (command) {
      await this.device.runCommand(command);
      return !(await this.isUnlocked());
    } else {
      throw Error("no lock command configured"); //K1ZFP TODO
    }
  }
}
