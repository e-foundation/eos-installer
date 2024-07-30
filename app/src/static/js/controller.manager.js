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
            new Step("activate-usb-debugging", undefined, true),
            new Step("enable-usb-file-transfer", undefined, true),
            new Step("device-detection", 'connect adb', true),

        ];
        this.currentIndex = 0;//6;
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
                try {
                    await this.deviceManager.downloadAll((loaded, total, name) => {
                        VIEW.onDownloading(name, loaded, total);
                    }, (loaded, total, name) => {
                        VIEW.onUnzip(name, loaded, total);
                    });
                    VIEW.onDownloadingEnd();
                    return true;
                } catch (e) {
                    console.error(e)
                    //K1ZFP TODO what to do on download error ?
                }
                return false;
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
                    await this.deviceManager.connect(cmd.mode);
                    await this.onDeviceConnected();
                    return true;
                } catch (e) {
                    //K1ZFP TODO
                    console.error(e);
                    return false;
                }
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
                if (!isUnlocked) {
                    WDebug.log("ControllerManager unlock: ", this.deviceManager.adb.getProductName());
                    try {
                        if (this.deviceManager.adb.getProductName() === "Teracube_2e") { //K1ZFP Hardcoded behavior
                            this.deviceManager.unlock(cmd.command);
                        } else {
                            await this.deviceManager.unlock(cmd.command);
                        }
                    } catch (e) {
                        //on some device, check unlocked does not work but when we try the command, it throws an error with "already unlocked"
                        if (e.bootloaderMessage?.includes("already")) {

                        } else if (e.bootloaderMessage?.includes("not allowed")) {
                            //K1ZFP TODO
                        }
                    }
                }
                return true;
            case Command.CMD_TYPE.lock:
                let isLocked = false;
                let is_teracube = this.deviceManager.adb.getProductName() === "Teracube_2e"; // K1ZFP Hard coded behavior
                if (cmd.partition) {
                    try {
                        isLocked = !(await this.deviceManager.getUnlocked(cmd.partition));
                    } catch (e) {
                    }
                }
                if (!isLocked) {
                    //try command
                    try {
                        if (is_teracube) {
                            this.deviceManager.lock(cmd.command);
                            isLocked = true; // Assumes lock works
                        } else
                            await this.deviceManager.lock(cmd.command);
                    } catch (e) {
                        //on some device, check unlocked does not work but when we try the command, it throws an error with "already locked"
                        if (e.bootloaderMessage?.includes("already")) {
                            isLocked = true;
                        } else {
                            console.error(e); //K1ZFP TODO
                        }
                    }
                }
                if (!isLocked) {
                    this.deviceManager.lock(cmd.command);
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
            this.model = productName.toLowerCase().replace(/[ |_]/g, '');
            WDebug.log("ControllerManager Model:", this.model);
            try {
                const resources = await this.getResources();
                if(resources.android){
                    VIEW.updateData('android-version-required', resources.android);
                    await this.checkAndroidVersion(resources.android);
                }
                this.setResources(resources);
            } catch(e) {
                console.log(e)
                console.log(e.message)
                WDebug.log(e);
                this.steps.push(new Step(e.message));
                VIEW.updateTotalStep(this.steps.length);
            }
        }
    }
    async checkAndroidVersion(versionRequired){
        const android = await this.deviceManager.getAndroidVersion();
        if( android) {
            VIEW.updateData('android-version', android);
            if(android < versionRequired){
                throw Error('android-version-not-supported');
            }
        }
    }
    async getResources(){
        let resources;
        try {
            resources = await (await fetch(`resources/${this.model}.json`)).json();
        } catch (e) {}
        if(!resources){
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
