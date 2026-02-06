import { Device } from "./device.class.js";
import { WDebug } from "../../debug.js";
import { AdbDevice } from "../../lib/index.ts";

export class Recovery extends Device {
  constructor(device) {
    super(device);
    this._adbDevice = null;
  }

  isRecovery() {
    return true;
  }

  async connect() {
    try {
      this._adbDevice = await AdbDevice.requestDevice();
      await this._adbDevice.connect();
      this.device = { name: this._adbDevice.usbDevice.productName };
      WDebug.log("Recovery connected:", this._adbDevice.usbDevice.productName);
    } catch (e) {
      this.device = null;
      throw new Error(`Cannot connect Recovery ${e.message || e}`);
    }
  }

  async sideload(blob) {
    try {
      await this._adbDevice.sideload(blob, (block, totalBlocks) => {
        if (block % 10 === 0) {
          WDebug.log(`Sideloading block ${block}/${totalBlocks}`);
        }
      });
    } catch (e) {
      throw new Error(`Sideload fails ${e.message || e}`);
    }
  }

  async reboot(mode) {
    return await this._adbDevice.reboot(mode);
  }

  getProductName() {
    return this._adbDevice?.usbDevice?.productName;
  }

  getSerialNumber() {
    return this._adbDevice?.usbDevice?.serialNumber;
  }
}
