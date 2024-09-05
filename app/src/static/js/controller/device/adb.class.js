import {Device} from "./device.class.js";
import {WDebug} from "../../debug.js";
import { ErrorManager } from "../../errorManager.js";

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
        try {
            //K1ZFP TODO : Manage this.webusb.isAdb()?
            /*
            this.webusb = await Adb.open("WebUSB");
            if (this.webusb.isAdb()) {
                this.device = await this.webusb.connectAdb("host::", cb);

            */
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

                return true;
            } else {
                ErrorManager.displayError('Error','no device found');
            }
        } catch (e) {
            this.device = null;
            throw Error(e);
        }
        return false;
    }

    getProductName() {
        return this.webusb.name;
    }


    getSerialNumber() {
        return this.device.serialNumber;
    }

    async getAndroidVersion() {
        return this.webusb.getProp('ro.build.version.release');
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
