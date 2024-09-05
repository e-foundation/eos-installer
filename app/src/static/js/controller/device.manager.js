import {Bootloader} from "./device/bootloader.class.js";
import {Downloader} from "./downloader.manager.js";
import {ADB} from "./device/adb.class.js";
import {Recovery} from "./device/recovery.class.js";
import {Device} from "./device/device.class.js";
const MODE = {
    adb: 'adb',
    recovery: 'recovery',
    bootloader: 'bootloader',
}

/**
 * wrap device functions
 * */
export class DeviceManager {
    constructor() {
        this.model = '';
        this.rom = undefined;
        this.key = undefined;
        this.patch = [];
        this.oem = undefined;
        this.device = new Device();
        this.bootloader = new Bootloader();
        this.recovery = new Recovery();
        this.adb = new ADB();
        this.downloader = new Downloader();
    }

    async init() {
        await this.bootloader.init();
        await this.adb.init();
        await this.recovery.init();
        await this.downloader.init();
    }

    /**
     * @param serialNumber
     * @returns {boolean}
     *
     * We check if the serialNumber is the same as our connected device
     *  Because productName may not be the same between adb/fastboot driver
     *
     */
    wasAlreadyConnected(serialNumber) {
        if (this.serialNumber) {
            return this.serialNumber === serialNumber;
        }
        this.serialNumber = serialNumber;
        return false;
    }

    setResources(folder, steps ) {
        this.folder = folder;
        this.files = steps.map(s => {
            return s.commands.map(c => {
                return c.file;
            })
        }).flat();
    }

    async getUnlocked(variable) {
        return this.bootloader.isUnlocked(variable);
    }
    async getAndroidVersion() {
        return await this.device.getAndroidVersion();
    }
    async isDetected(){
        const serial = this.serialNumber;
        if(serial) {
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
            case MODE.bootloader :
                this.device = this.bootloader;
                break;
            case MODE.adb :
                this.device = this.adb;
                break;
            case MODE.recovery :
                this.device = this.recovery;
                break;
        }
    }
    async connect(mode) {
        this.setMode(mode);
        if (mode =='recovery') {
            try {
                await this.adb.webusb.dispose(); 
            } catch (e){
                console.log(e)
            }
        }
        return await this.device.connect();
    }

    isConnected() {
        return this.device.isConnected();
    }
    /**
     * @param mode
     * @returns {boolean}
     *
     */
    isInMode(mode) {
        if(this.isConnected()){
            switch (mode) {
                case 'bootloader':
                    return this.device.isBootloader();
                case 'adb':
                    return this.device.isADB();
                case 'recovery':
                    return this.device.isRecovery();
            }
        }
        return false;
    }

    erase(partition) {
        return this.bootloader.runCommand(`erase:${partition}`);
    }

    format(argument) {
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
            throw Error(`error getting blob file ${file}`);
        }
        return await this.bootloader.flashBlob(partition, blob, onProgress);
    }


    getProductName() {
        return this.device.getProductName();
    }

    getSerialNumber() {
        return this.device.getSerialNumber();
    }



    async reboot(mode) {
        const res = await this.device.reboot(mode);
        if(res) {
            this.setMode(mode);
        }
        return res;
    }

    async sideload(file) {
        let blob = await this.downloader.getFile(file);
        if (!blob) {
            throw Error(`error getting blob file ${file}`);
        }
        
        return await this.device.sideload(blob);
    }

    async runCommand(command) {
        try {
            return this.device.runCommand(command);
        } catch (e) {
            console.error(e); //K1ZFP TODO
            throw Error(`error ${command} failed`);
        }
    }

    async downloadAll(onProgress, onUnzip) {
        return await this.downloader.downloadAndUnzipFolder(this.files, this.folder, onProgress, onUnzip);
    }
}