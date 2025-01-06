import {Device} from "./device.class.js";
import {WDebug} from "../../debug.js";
import {AdbWebBackend, Adb2} from "../../lib/webadb/adb.bundle.js";

export class ADB extends Device {
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
        } catch (e) {
            return false;
        }
    }

    isADB() {
        return true;
    }

    async connect(cb) {
        let res = false;
        try {
            console.log("debug adb connect")
            let adbWebBackend = await AdbWebBackend.requestDevice();
            if (adbWebBackend) {
                let adbDevice = new Adb2(adbWebBackend, null); //adb.bundle.js
                await adbDevice.connect();
                this.device = adbWebBackend._device;
                this.webusb = adbDevice;

                WDebug.log("----------------------------------");
                WDebug.log("Model", adbDevice.model);
                WDebug.log("product", adbDevice.product);
                WDebug.log("Name", adbDevice.name);
                WDebug.log(">Device (codename)", adbDevice.device); // codemane
                WDebug.log("----------------------------------");

                res = true;
            }
        } catch (e) {
            this.device = null;
            throw new Error(`Cannot connect ADB ${e.message || e}`);
        } finally {
            return res;
        }
    }

    getProductName() {
        return this.webusb.name;
    }

    async getAndroidVersion() {
        return this.webusb.getProp('ro.build.version.release');
    }

    async getSerialNumber() {
        return this.webusb.getProp("ro.boot.serialno");
    }

    async runCommand(cmd) {
        WDebug.log("ADB Run command>", cmd);
        return await this.webusb.exec(cmd);
    }

    async reboot(mode) {
        const res = await this.webusb.createStreamAndReadAll(`reboot:${mode}`);
        return res;

    }



}
