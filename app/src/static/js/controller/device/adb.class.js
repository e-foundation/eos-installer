import {Device} from "./device.class.js";

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
            this.webusb = await Adb.open("WebUSB");
            if (this.webusb.isAdb()) {
                this.device = await this.webusb.connectAdb("host::", cb);
                return true;
            }
        } catch (e) {
            this.device = null;
            throw Error(e);
        }
        return false;
    }

    getProductName() {
        return this.webusb.device.productName;
    }

    getSerialNumber() {
        return this.webusb.device.serialNumber;
    }

    async runCommand(cmd) {
        let shell = await this.device.shell(cmd);
        return await shell.receive();
    }

    async reboot(mode) {
        return await this.device.shell(`reboot ${mode}`);
    }

}