import {DeviceManager} from "./controller/device.manager.js";
import {Command} from "./controller/device/command.class.js";
import {Step} from "./controller/utils/step.class.js";
import {WDebug} from "./debug.js";
/*
* Class to manage process
* Check and display the steps, interact with deviceManager
*/
export class Controller {
    constructor() {
        this.steps = [
            new Step("let-s-get-started", undefined, true),
            new Step("connect-your-phone",  undefined, true),
            new Step("activate-developer-options", undefined, true),
            new Step("activate-oem-unlock", undefined, true),
            new Step("activate-usb-debugging", undefined, true),
            new Step("enable-usb-file-transfer", undefined, true),
            new Step("device-detection", 'connect adb', true),
        ];
        this.currentIndex = 0;
    }


    async init() {
        this.deviceManager = new DeviceManager();
        await this.deviceManager.init();
        //VIEW.onStepStarted(this.steps[this.currentIndex]);
    }

    async next() {

        let current = this.steps[this.currentIndex];
        let next = this.steps[this.currentIndex + 1];

        WDebug.log("Controller Manager Next", next);

        if (next) {
            //K1ZFP check this
            if (next.mode) { //if next step require another mode [adb|fastboot|bootloader]
                if (this.deviceManager.isConnected() && !this.inInMode(next.mode)) {
                    //we need reboot
                    await this.deviceManager.reboot(next.mode);
                }
                if (!this.deviceManager.isConnected()) {
                    await this.deviceManager.connect(next.mode);
                }
            }
            this.currentIndex++;
            current = this.steps[this.currentIndex];
            VIEW.onStepStarted(this.currentIndex, current);
            if (!current.needUserGesture) {
                await this.executeStep(current.name);
            }
        }
    }

    async executeStep(stepName) {
        const current = this.steps[this.currentIndex];
        WDebug.log("ControllerManager Execute step", current)
        if (current.name === stepName) {
            let res = true;
            for (let i = 0; i < current.commands.length && res; i++) {
                res = await this.runCommand(current.commands[i]);
            }
            const next = this.steps[this.currentIndex + 1];
            let previous = this.steps[this.currentIndex - 1];
            if (res) {
                if (next) {
                    VIEW.onStepFinished(current, next);
                    await this.next();
                }
            } else {
                VIEW.onStepFailed(current, previous);
                if (!current.needUserGesture) {
                    this.currentIndex--;
                }
                throw Error('command failed');
            }
        } else {
            throw Error('this is not the current step')
        }
    }

    /**
     *
     * @param mode
     * @returns {boolean}
     * Check if device is connected to a mode
     */
    inInMode(mode) {
        return this.deviceManager.isInMode(mode);
    }

    async runCommand(cmd) {
        WDebug.log("ControllerManager run command:", cmd);
        switch (cmd.type) {
            case Command.CMD_TYPE.download:
                let res = false;
                try {
                    await this.deviceManager.downloadAll((loaded, total, name) => {
                        VIEW.onDownloading(name, loaded, total);
                    }, (loaded, total, name) => {
                        VIEW.onUnzip(name, loaded, total);
                    });
                    VIEW.onDownloadingEnd();
                    res = true;
                } catch (e) {
                    throw new Error(`Cannot download ${e.message || e}`);
                } finally {
                    return res;
                }
            case Command.CMD_TYPE.reboot:
                try {
                    await this.deviceManager.reboot(cmd.mode);
                } catch (e) {
                    console.error(e);
                    //K1ZFP TODO
                    return false;
                }
                return true;
            case Command.CMD_TYPE.connect:
                try {
                    const res = await this.deviceManager.connect(cmd.mode);
                    if (res) {
                        await this.onDeviceConnected();
                        return true;
                    } 
                } catch (e) {
                    throw new Error(`The device is not connected ${e.message || e}`);
                }
                return false;
            case Command.CMD_TYPE.erase:
                return this.deviceManager.erase(cmd.partition);
            case Command.CMD_TYPE.flash:
                return this.deviceManager.flash(cmd.file, cmd.partition, (done, total) => {
                    VIEW.onInstalling(cmd.file, done, total);
                });
            case Command.CMD_TYPE.unlock:
                //check if unlocked to avoid unnecessary command
                let isUnlocked = false;
                if (cmd.partition) {
                    try {
                        isUnlocked = await this.deviceManager.getUnlocked(cmd.partition);
                    } catch (e) {
                    }
                }
                WDebug.log("ControllerManager unlock: ", this.deviceManager.adb.getProductName() + " isUnlocked = " + isUnlocked);
                if (!isUnlocked) {
                    try {
                        this.deviceManager.unlock(cmd.command); // Do not await thus display unlocking screen
                    } catch (e) {
                        //on some device, check unlocked does not work but when we try the command, it throws an error with "already unlocked"
                        if (e.bootloaderMessage?.includes("already")) {

                        } else if (e.bootloaderMessage?.includes("not allowed")) {
                            //K1ZFP TODO
                        }
                    }
                } else {
                    WDebug.log("The phone is not locked - bypass lock process");
                    this.currentIndex++;
                }
                return true;
            case Command.CMD_TYPE.lock:
                let isLocked = false;
                if (cmd.partition) {
                    try {
                        isLocked = !(await this.deviceManager.getUnlocked(cmd.partition));
                    } catch (e) {
                    }
                }
                if (!isLocked) {
                    try {
                        this.deviceManager.lock(cmd.command); // Do not await thus display unlocking screen
                    } catch (e) {
                        //on some device, check unlocked does not work but when we try the command, it throws an error with "already locked"
                        if (e.bootloaderMessage?.includes("already")) {
                            isLocked = true;
                        } else {
                            console.error(e); //K1ZFP TODO
                        }
                    }
                }
                return true;
            case Command.CMD_TYPE.sideload:
                try {
                    await this.deviceManager.connect('recovery');
                    await this.deviceManager.sideload(cmd.file);
                    return true;
                } catch (e) {
                    console.error(e); // K1ZFP TODO
                    return false;
                }
            case Command.CMD_TYPE.format:
                try {
                    this.deviceManager.for(cmd.partition);
                } catch (e) {
                    console.error(e); // K1ZFP TODO
                }
                return true;
            case Command.CMD_TYPE.delay:
                await new Promise(resolve => setTimeout(resolve, cmd.partition));
                return true;

            default:
                WDebug.log(`try unknown command ${cmd.command}`)
                await this.deviceManager.runCommand(cmd.command);
                return true;
        }
    }

    async onDeviceConnected() {

        const serialNumber = this.deviceManager.getSerialNumber();
        const productName = this.deviceManager.getProductName();
        const wasAlreadyConnected = this.deviceManager.wasAlreadyConnected(serialNumber);
        if (!wasAlreadyConnected) {
            VIEW.updateData('product-name', productName);
            this.model = productName;
            WDebug.log("ControllerManager Model:", this.model);
            try {
                const resources = await this.getResources();
                
                if(resources.android){
                    VIEW.updateData('android-version-required', resources.android);
                    await this.checkAndroidVersion(resources.android);
                }
                this.setResources(resources);
            } catch(e) {
                this.steps.push(new Step(e.message));
                VIEW.updateTotalStep(this.steps.length);
                throw new Error(`onDeviceConnected ${e.message || e}`);
            }
        }
    }
    async checkAndroidVersion(versionRequired){
        const android = await this.deviceManager.getAndroidVersion();
        WDebug.log("current android version:", android);
        if( android) {
            VIEW.updateData('android-version', android);
            if(android < versionRequired){
                throw Error('android-version-not-supported');
            }
        }
    }
    async getResources(){

        let resources = null;
        try {
            let current_security_path_level = null;
            try {
                const security_patch = await this.deviceManager.adb.webusb.getProp("ro.build.version.security_patch");
                //WDebug.log('security_patch', security_patch)
                current_security_path_level = parseInt(security_patch.replace(/-/g, ''), 10);
                WDebug.log("current_security_path_level", current_security_path_level);

            } catch(ee) {
                WDebug.log("Security patch Error");
                current_security_path_level = null;
            }

            let this_model = this.deviceManager.adb.webusb.device;
            // K1ZFP Manage here model override see https://gitlab.e.foundation/e/os/backlog/-/issues/2475
            if (this.deviceManager.adb.webusb.model == "Teracube 2e") { // Official ROM
                if (this.deviceManager.adb.webusb.product == "Teracube_2e") { //emerald
                    this_model = "emerald";
                } else if (this.deviceManager.adb.webusb.product == "Teracube_2e") {
                    this_model = "Teracube_2e";
                } else {
                    const id = 
                    "model "+this.deviceManager.adb.webusb.model + " " + 
                    "product "+this.deviceManager.adb.webusb.product + " " +
                    "name "+this.deviceManager.adb.webusb.name + " " +
                    "device "+this.deviceManager.adb.webusb.device;
                    throw new Error("Cannot find device resource", id);
                }              
            } 
            else if (this.deviceManager.adb.webusb.model == "Teracube_2e") { // under e/OS/
                if (this.deviceManager.adb.webusb.device == "emerald") { //emerald
                    this_model = "emerald";
                } else if (this.deviceManager.adb.webusb.device == "zirconia") {
                    this_model = "Teracube_2e";
                } else {
                    const id = 
                    "model "+this.deviceManager.adb.webusb.model + " " + 
                    "product "+this.deviceManager.adb.webusb.product + " " +
                    "name "+this.deviceManager.adb.webusb.name + " " +
                    "device "+this.deviceManager.adb.webusb.device;
                    throw new Error("Cannot find device resource", id);
                }
            }

            resources = await (await fetch(`resources/${this_model}.json`)).json();
            if (current_security_path_level != null && typeof resources.security_patch_level != 'undefined') {
                WDebug.log("EOS Rom has security patch ");
                const new_security_path_level = parseInt(resources.security_patch_level.replace(/-/g, ''), 10);
                if (current_security_path_level > new_security_path_level) {
                    WDebug.log("Bypass lock procedure", `resources/${this_model}-safe.json`);
                    resources = await (await fetch(`resources/${this_model}-safe.json`)).json();
                }
            }
        } catch (e) {
            resources = null;
            WDebug.log("getRessources Error");
            if (override)
                throw Error('device-model-not-supported');
        }

        return resources;
    }

    setResources(resources){
        this.resources = resources;
        if (this.resources.steps) {
            this.steps.push(new Step("downloading", 'download', false));
            this.steps.push(...this.resources.steps.map((step) => {
                return new Step(step.id, step.command, step.needUserGesture ?? false, step.mode);
            }));
            VIEW.updateTotalStep(this.steps.length);
        }
        this.deviceManager.setResources(this.resources.folder, this.steps);
    }
}
