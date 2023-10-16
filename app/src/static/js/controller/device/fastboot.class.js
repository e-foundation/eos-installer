import {Device} from "./device.class.js";


export class Fastboot extends Device {
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

    isFastboot() {
        return true;
    }

    async connect() {
        try {
            this.webusb = await Adb.open("WebUSB");
            if (this.webusb.isFastboot()) {
                this.device = await this.webusb.connectFastboot("host::");
                return true;
            }
        } catch (e) {
            this.device = null;
            throw Error(e);
        }
        return false;
    }

    async reboot(mode) {
        return false;
    }

    getProductName() {
        return this.webusb.device.productName;
    }

    getSerialNumber() {
        return this.webusb.device.serialNumber;
    }

    write(data) {
        return this.device.transport.send(this.device.ep_out, data);
    }

    read(l) {
        return this.device.transport.receive(this.device.ep_in, l);
    }


}