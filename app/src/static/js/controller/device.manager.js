import {Bootloader} from "./device/bootloader.class.js";
import {Downloader} from "./downloader.manager.js";
import {ADB} from "./device/adb.class.js";
import {Recovery} from "./device/recovery.class.js";
import {Fastboot} from "./device/fastboot.class.js";
import {Device} from "./device/device.class.js";

const MODE = {
    adb: 'adb',
    recovery: 'recovery',
    bootloader: 'bootloader',
    fastboot: 'fastboot',
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
        this.resources = {};
        this.device = new Device();
        this.bootloader = new Bootloader();
        this.recovery = new Recovery();
        this.fastboot = new Fastboot();
        this.adb = new ADB();
        this.downloader = new Downloader();
    }

    async init() {
        await this.bootloader.init();
        await this.adb.init();
        await this.fastboot.init();
        await this.recovery.init();
        await this.downloader.init();
    }

    /**
     * @param serialNumber
     * @returns {boolean}
     *
     * We check if the serialNumber is the same as our connected device
     * If it is, then the device was already connected
     *
     */
    wasAlreadyConnected(serialNumber) {
        if (this.serialNumber) {
            return this.serialNumber === serialNumber;
        }
        this.serialNumber = serialNumber;
        return false;
    }

    setResources(resources) {
        this.resources = resources;
        this.folder = Array.isArray(resources.folder) ? resources.folder : [resources.folder];
    }
    downloadResources(onDownloading, onUnzip){
        return this.downloadAll(onDownloading, onUnzip);
    }

    async getUnlocked(variable) {
        return this.bootloader.isUnlocked(variable);
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
            case MODE.fastboot :
                this.device = this.fastboot;
                break;
        }
    }
    async connect(mode) {
        this.setMode(mode);
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
                case 'fastboot':
                    return this.device.isFastboot();
            }
        }
        return false;
    }

    erase(partition) {
        return this.bootloader.runCommand(`erase:${partition}`);
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
        let res = false;
        try {
            res = this.device.reboot(mode);
            this.setMode(mode);
        } catch (e) {
            console.error(e);
        }
        let isBack = false;
        if(res){
            while(!isBack) {
                await sleep(5000);
                try{
                    isBack = await this.isDetected();
                } catch (e){
                    console.error(e);
                    isBack = true; //TODO what to do in case getDevices does not work ?
                }
            }
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
            console.error(e);
            throw Error(`error ${command} failed`);
        }
    }

    async downloadAll(onProgress, onUnzip) {
        /*let filesName = [];
        if (this.patch?.length) {
            for (var i = 0; i < this.patch.length; i++) {
                if (this.patch[i].file) {
                    filesName.push(this.patch[i].file);
                }
            }
        }
        if (this.rom?.file) {
            filesName.push(this.rom.file)
        }
        if (this.key?.length) {
            for (var i = 0; i < this.key.length; i++) {
                if (this.key[i].file) {
                    filesName.push(this.key[i].file);
                }
            }
        }
        filesName = filesName.filter((item, index) => filesName.indexOf(item) === index);*/
        return await this.downloader.downloadAndUnzipFolder(this.folder, onProgress, onUnzip);
    }
}