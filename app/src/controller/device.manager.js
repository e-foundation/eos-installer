import { Bootloader } from "./device/bootloader.class.js";
import { Downloader } from "./downloader.manager.js";
import { ADB } from "./device/adb.class.js";
import { Recovery } from "./device/recovery.class.js";
import { Device } from "./device/device.class.js";
import { WDebug } from "../debug.js";
const MODE = {
  adb: "adb",
  recovery: "recovery",
  bootloader: "bootloader",
};

/**
 * wrap device functions
 * */
export class DeviceManager {
  constructor() {
    this.model = "";
    this.rom = undefined;
    this.key = undefined;
    this.patch = [];
    this.oem = undefined;
    this.device = new Device();
    this.bootloader = new Bootloader();
    this.recovery = new Recovery();
    this.adb = new ADB();
    this.downloader = new Downloader();
    this.wasConnected = false;
  }

  async init() {
    await this.bootloader.init();
    await this.adb.init();
    await this.recovery.init();
    await this.downloader.init();
  }

  isFirstConnection() {
    return !this.wasConnected;
  }

  markAsConnected() {
    this.wasConnected = true;
  }

  setResources(folder, steps) {
    this.folder = folder;
    this.files = steps
      .map((s) => {
        return s.commands.map((c) => {
          return c.file;
        });
      })
      .flat();
  }

  async getUnlocked(variable) {
    return this.bootloader.isUnlocked(variable);
  }
  async getAndroidVersion() {
    return await this.device.getAndroidVersion();
  }
  async isDetected() {
    const serial = this.serialNumber;
    if (serial) {
      const devices = await navigator.usb.getDevices();
      return !!devices.length;
    }
    return false;
  }

  /**
   * @param mode
   * @returns {any}
   *
   * We set the device to the mode manager we went to connect to
   * And we connect the device
   *
   */
  async setMode(mode) {
    switch (mode) {
      case MODE.bootloader:
        this.device = this.bootloader;
        break;
      case MODE.adb:
        this.device = this.adb;
        break;
      case MODE.recovery:
        this.device = this.recovery;
        break;
    }
  }
  async connect(mode) {
    await this.setMode(mode);
    try {
      return await this.device.connect();
    } catch (e) {
      throw new Error(`Failed to connect: ${e.message || e}`);
    }
  }

  /**
   * @param mode
   * @returns {boolean}
   *
   */
  isInMode(mode) {
    switch (mode) {
      case "bootloader":
        return this.device.isBootloader();
      case "adb":
        return this.device.isADB();
      case "recovery":
        return this.device.isRecovery();
    }
    return false;
  }

  erase(partition) {
    return this.bootloader.runCommand(`erase:${partition}`);
  }

  format() {
    return true;
    //        return this.bootloader.runCommand(`format ${argument}`);
    //        the fastboot format md_udc is not supported evne by the official fastboot program
  }

  unlock(command) {
    return this.bootloader.runCommand(command);
  }

  lock(command) {
    return this.bootloader.runCommand(command);
  }

  async flash(file, partition, onProgress) {
    let blob = await this.downloader.getFile(file);
    if (!blob) {
      throw new Error(`error getting blob file ${file}`);
    }
    let flashed = false;
    try {
      flashed = await this.bootloader.flashBlob(partition, blob, onProgress);
    } catch (e) {
      throw new Error(`error flashing file ${file} ${e.message || e}`);
    }
    return flashed;
  }

  getProductName() {
    return this.device.getProductName();
  }

  getSerialNumber() {
    return this.device.getSerialNumber();
  }

  async reboot(mode) {
    const res = await this.device.reboot(mode);
    if (res) {
      this.setMode(mode);
    }
    return res;
  }

  async sideload(file) {
    let blob = await this.downloader.getFile(file);
    if (!blob) {
      throw new Error(`error getting blob file ${file}`);
    }

    return await this.device.sideload(blob);
  }

  async runCommand(command) {
    try {
      return this.device.runCommand(command);
    } catch (e) {
      throw new Error(`error ${command} failed <br/> ${e.message || e}`);
    }
  }

  /**
   * Wait for a USB device to appear on the bus.
   * Some USB host controllers (e.g., AMD Ryzen) are slow to re-enumerate
   * devices after a mode switch, especially Mediatek bootloader devices.
   * Resolves when a device appears or after timeout (does not reject).
   */
  waitForDeviceOnBus(timeoutMs = 30000) {
    const startTime = Date.now();
    return new Promise((resolve) => {
      const devices = navigator.usb.getDevices();
      devices.then((list) => {
        WDebug.log(
          `waitForDeviceOnBus: getDevices() returned ${list.length} device(s)`,
          list.map((d) => `${d.vendorId}:${d.productId} "${d.productName}"`),
        );
        if (list.length > 0) {
          WDebug.log("waitForDeviceOnBus: device already visible, no wait needed");
          resolve();
          return;
        }

        WDebug.log(
          `waitForDeviceOnBus: no devices found, listening for USB connect event (timeout=${timeoutMs}ms)...`,
        );

        const timeout = setTimeout(() => {
          navigator.usb.removeEventListener("connect", onConnect);
          const elapsed = Date.now() - startTime;
          WDebug.log(
            `waitForDeviceOnBus: timeout after ${elapsed}ms, no device appeared. Proceeding anyway.`,
          );
          resolve();
        }, timeoutMs);

        const onConnect = (event) => {
          const elapsed = Date.now() - startTime;
          const d = event.device;
          WDebug.log(
            `waitForDeviceOnBus: USB connect event after ${elapsed}ms - ` +
              `vendorId=${d.vendorId} productId=${d.productId} ` +
              `productName="${d.productName}" serialNumber="${d.serialNumber}"`,
          );
          clearTimeout(timeout);
          navigator.usb.removeEventListener("connect", onConnect);
          // Small delay to let the device fully initialize after enumeration
          WDebug.log("waitForDeviceOnBus: waiting 1000ms for device to stabilize...");
          setTimeout(resolve, 1000);
        };

        navigator.usb.addEventListener("connect", onConnect);
      });
    });
  }

  async downloadAll(onProgress, onUnzip, onVerify) {
    try {
      await this.downloader.downloadAndUnzipFolder(
        this.files,
        this.folder,
        onProgress,
        onUnzip,
        onVerify,
      );
    } catch (e) {
      throw new Error(`downloadAll error ${e.message || e}`);
    }
  }
}
