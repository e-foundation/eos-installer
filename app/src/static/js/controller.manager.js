import {DeviceManager} from "./controller/device.manager.js";
import {Command} from "./controller/device/command.class.js";
import {Step} from "./controller/utils/step.class.js";


/*
* Class to manage process
* Check and display the steps, interact with deviceManager
*/
export class Controller {
    constructor() {
        this.steps = [
            new Step("let-s-get-started",  undefined, true ),
            new Step("check-your-android-version",  undefined, true ),
            new Step("connect-your-phone",  undefined, true),
            new Step("activate-developer-options", undefined, true),
            new Step("activate-usb-debugging", undefined, true),
            new Step("enable-usb-file-transfer", undefined, true),
            new Step("device-detection",  'connect adb', true),

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
        if (next) {
            if (next.mode) { //if next step require another mode [adb|fastboot|bootloader]
                if(this.deviceManager.isConnected() && !this.inInMode(next.mode)){
                    //we need reboot
                    await this.deviceManager.reboot(next.mode);
                }
                if(!this.deviceManager.isConnected()){
                    await this.deviceManager.connect(next.mode);
                }
            }
            this.currentIndex++;
            current = this.steps[this.currentIndex];
            VIEW.onStepStarted(this.currentIndex, current);
            if(!current.needUserGesture) {
                await this.executeStep(current.name);
            }
            /*current.commandDone = await this.runCommand(current.command);
            if(current.commandDone) {
                next = this.steps[this.currentIndex + 1];
                if(next && current.nextWhenFinished) {
                    await this.next();
                }
            } else {
                VIEW.onStepFailed(current, previous);
                this.currentIndex--;
                throw Error('command failed');
            }*/
        }
    }
    async executeStep(stepName){
        const current = this.steps[this.currentIndex];
        console.trace()
        if(current.name === stepName) {
            let res = true;
            for(let i = 0 ; i < current.commands.length && res; i++) {
                res = await this.runCommand(current.commands[i]);
            }
            const next = this.steps[this.currentIndex + 1];
            let previous = this.steps[this.currentIndex - 1];
            if(res) {
                if(next) {
                    VIEW.onStepFinished(current, next);
                    await this.next();
                }
            } else {
                VIEW.onStepFailed(current, previous);
                if(!current.needUserGesture) {
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
        switch (cmd.type) {
            case Command.CMD_TYPE.download:
                try {
                    const files = this.steps.map(s =>{
                        return s.commands.map(c =>  {
                            console.log(c)
                           return c.file;
                        })
                    }).flat();
                    await this.deviceManager.downloadAll(files,(loaded, total, name) => {
                        VIEW.onDownloading(name, loaded, total);
                    }, (loaded, total, name) => {
                        VIEW.onUnzip(name, loaded, total);
                    });
                    VIEW.onDownloadingEnd();
                    return true;
                } catch (e) {
                    console.error(e)
                    //TODO what to do on download error ?
                }
                return false;
            case Command.CMD_TYPE.reboot:
                try {
                    await this.deviceManager.reboot(cmd.mode);
                } catch (e) {
                    console.error(e);
                    return false;
                }
                return true;
            case Command.CMD_TYPE.connect:
                try {
                    await this.deviceManager.connect(cmd.mode);
                    await this.onDeviceConnected();
                    return true;
                } catch (e) {
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
                    //try command
                    try {
                        await this.deviceManager.unlock(cmd.command);
                        //this.steps[this.currentIndex].needUser = true;
                    } catch (e) {
                        //on some device, check unlocked does not work but when we try the command, it throws an error with "already unlocked"
                        if (e.bootloaderMessage?.includes("already")) {
                            await this.deviceManager.reboot('adb');
                        } else if (e.bootloaderMessage?.includes("not allowed")) {
                            //TODO
                        }
                    }
                }
                if (!isUnlocked) {
                    //it's not unlocked
                    //the unlock command needs for the user to accept unlocking on the device and restarting the phone, like the commands used at the start
                    //TODO
                    /*const stepsToAdd = this.startCommand.concat([
                        this.steps[this.currentIndex]
                    ])
                    this.addSteps(stepsToAdd, this.currentIndex + 1);*/
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
                    //try command
                    try {
                        await this.deviceManager.lock(cmd.command);
                    } catch (e) {
                        //on some device, check unlocked does not work but when we try the command, it throws an error with "already locked"
                        if (e.bootloaderMessage?.includes("already")) {
                            isLocked = true;
                        } else {
                            console.error(e);
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
                    console.error(e);
                    return false;
                }
                break;
            default:
                console.log(`try unknown command ${cmd.command}`)
                await this.deviceManager.runCommand(cmd.command);
                return true;
                break;
        }
    }

    async onDeviceConnected() {
        const serialNumber = this.deviceManager.adb.device.serialNumber;
        const productName = this.deviceManager.adb.device.productName;
        if (this.deviceManager.wasAlreadyConnected(serialNumber)) {
            //already connected
            //we check on serialNumber because productName may not be the same between adb/fastboot driver
        } else {
            VIEW.updateData('product-name', productName);
            try {
                this.model = productName.toLowerCase().replace(/[ |_]/g, '');
                this.resources = await (await fetch(`resources/${this.model}.json`)).json() || {};
            } catch (e) {
            }
            if (this.resources) {
                this.deviceManager.setResources(this.resources);
                if (this.resources.steps) {
                    this.steps.push(new Step("downloading", 'download', false));
                    this.steps.push(...this.resources.steps.map((step) => {
                        return new Step(step.id,  step.command, step.needUserGesture ?? false,  step.mode);
                    }));
                    VIEW.updateTotalStep(this.steps.length);
                }
            } else {
                this.steps.push(new Step("device-model-not-supported"));
                VIEW.updateTotalStep(this.steps.length);
            }
        }
    }

}
