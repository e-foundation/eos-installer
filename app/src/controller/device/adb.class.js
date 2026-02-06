import { Device } from "./device.class.js";
import { WDebug } from "../../debug.js";
import { AdbDevice } from "../../lib/index.ts";

export class ADB extends Device {
  constructor(device) {
    super(device);
    this._adbDevice = null;
  }

  isADB() {
    return true;
  }

  async connect() {
    try {
      console.log("debug adb connect");

      // Try to find a paired device first, then request if needed
      this._adbDevice = await AdbDevice.requestDevice();
      await this._adbDevice.connect();

      this.device = { name: this._adbDevice.usbDevice.productName };

      const banner = this._adbDevice.banner;
      WDebug.log("----------------------------------");
      WDebug.log("Model", banner.model);
      WDebug.log("product", banner.product);
      WDebug.log("Name", this._adbDevice.usbDevice.productName);
      WDebug.log(">Device (codename)", banner.device);
      WDebug.log("----------------------------------");
    } catch (e) {
      console.error(e);
      this.device = null;
      throw new Error(`Cannot connect ADB ${e.message || e}`);
    }
  }

  getProductName() {
    return this._adbDevice?.usbDevice?.productName;
  }

  get banner() {
    return this._adbDevice?.banner || { device: "", model: "", product: "" };
  }

  async getProp(name) {
    return this._adbDevice.getProp(name);
  }

  async getAndroidVersion() {
    return this._adbDevice.getProp("ro.build.version.release");
  }

  async getSerialNumber() {
    return this._adbDevice.getProp("ro.boot.serialno");
  }

  async runCommand(cmd) {
    WDebug.log("ADB Run command>", cmd);
    return await this._adbDevice.shell(cmd);
  }

  async reboot(mode) {
    return await this._adbDevice.reboot(mode);
  }
}
