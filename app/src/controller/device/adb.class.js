import { Device } from "./device.class.js";
import { WDebug } from "../../debug.js";

import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";

export class ADB extends Device {
  static Manager = AdbDaemonWebUsbDeviceManager.BROWSER;

  constructor(device) {
    super(device);
    this.webusb = null;
  }

  async isConnected() {
    if (!this.device) {
      return false;
    }
    try {
      return this.device.getDevice();
    } catch {
      return false;
    }
  }

  isADB() {
    return true;
  }

  async connect() {
    try {
      console.log("debug adb connect");

      let adbDaemonWebUsbDevice =
        await ADB.Manager.requestDevice(); /*AdbDaemonWebUsbDevice*/
      if (typeof adbDaemonWebUsbDevice == "undefined") {
        throw new Error("No device connected (1)");
      }

      let connection;
      try {
        connection =
          await adbDaemonWebUsbDevice.connect(); /*AdbDaemonWebUsbConnection*/
      } catch (err) {
        console.error(err);
        const devices = await ADB.Manager.getDevices();
        if (!devices.length) {
          throw new Error("No device connected (2)");
        }
        adbDaemonWebUsbDevice = devices[0]; /*AdbDaemonWebUsbDevice*/
      }

      const credentialStore = new AdbWebCredentialStore();
      const transport = await AdbDaemonTransport.authenticate({
        serial: connection.deserial,
        connection,
        credentialStore: credentialStore,
      });
      const adb = new Adb(transport);

      //const version = await adb.getProp("ro.build.version.release");

      this.device = adbDaemonWebUsbDevice;
      this.webusb = adb; /*Adb*/

      WDebug.log("----------------------------------");
      WDebug.log("Model", adb.transport.banner.model);
      WDebug.log("product", adb.transport.banner.product);
      WDebug.log("Name", adbDaemonWebUsbDevice.name);
      WDebug.log(">Device (codename)", adb.transport.banner.device); // codemane
      WDebug.log("----------------------------------");
    } catch (e) {
      console.error(e);
      this.device = null;
      throw new Error(`Cannot connect ADB ${e.message || e}`);
    }
  }

  getProductName() {
    return this.device.name;
  }

  async getAndroidVersion() {
    return this.webusb.getProp("ro.build.version.release");
  }

  async getSerialNumber() {
    return this.webusb.getProp("ro.boot.serialno");
  }

  async runCommand(cmd) {
    WDebug.log("ADB Run command>", cmd);
    return await this.webusb.exec(cmd);
  }

  async reboot(mode) {
    const res = await this.webusb.power.reboot(mode);
    return res;
  }
}
