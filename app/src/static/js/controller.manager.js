import {DeviceManager} from "./controller/device.manager.js";
import {Command} from "./controller/device/command.class.js";

/*
* Class to manage process
* Check and display the steps, interact with deviceManager
*/
export class Controller {
    constructor() {
        this.step = {
            unlock: false,
            lock: false,
            needUser: false,
        };
        this.startCommand = [
            {
                needUser: true,
                "title": "Requirements",
                "instruction": "OEM unlock authorized",
                done: true,
            },
            {
                needUser: true,
                "title": "Requirements",
                "instruction": "USB debugging authorized",
                done: true,
            },
            {
                needUser: true,
                "title": "Connect",
                "instruction": "please connect",
                "command": "connect adb"
            }
        ];
        this.steps = this.startCommand.map((c, i) => Object.assign({}, {index: i, id: `step_${i}`}, c));
        this.currentIndex = 0;
    }


    async init() {
        this.step.init = true;
        this.step.needUser = true;
        this.step.adbConnect = true;
        this.deviceManager = new DeviceManager();
        await this.deviceManager.init();
        VUE.renderProcess(this.steps);
        VUE.onStepStarted(this.steps[this.currentIndex]);
    }

    async next(fromUser) {
        let current = this.steps[this.currentIndex];
        let next = this.steps[this.currentIndex + 1];
        if (next) {
            if (next.mode && !this.inInMode(next.mode)) { //if next step require another mode [adb|fastboot|bootloader]
                //we need reboot
                await this.needReboot(next.mode);
                await this.next();
                return;
            } else if(next.needUser && !fromUser) {
                return;
            } else  {
                // previous step was not marked as done even tough the command was executed
                // it's most likely because we needed the user to click on continue
                // now it's totally done
                if(!current.done && this.isDone(current) && next.needUser && fromUser) {
                    current.done = true;
                    VUE.onStepFinished(current);
                };
                this.currentIndex++;
                current = this.steps[this.currentIndex];
                next = this.steps[this.currentIndex + 1];
                VUE.onStepStarted(current);
                current.commandDone = await this.executeStep(current);
                if (current.commandDone) {
                    current.done = !next.needUser; //not totally done if we need user to click on continue
                    VUE.onStepFinished(current, next);
                    await this.next();
                } else {
                    current.needUser = true;
                    this.currentIndex--;
                }
            }
        }
    }

    isDone(step){
        return (!step.command || (step.command && step.commandDone));
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

    /**
     *
     * @param mode
     * @returns {Promise<void>}
     *
     * add the necessary step for reboot
     */
    async needReboot(mode) {
        const stepsToAdd = []
        //run reboot
        //need the user to connect just after
        if(this.inInMode('fastboot')) {
        } else {
            stepsToAdd.push({
                "title": "Reboot",
                "instruction": `rebooting in ${mode}`,
                "command": `reboot ${mode}`
            });
        }
        stepsToAdd.push({
            "title": "Connect",
            "instruction": "please connect again",
            "command": `connect ${mode}`,
            "needUser" : true,
        })
        if(stepsToAdd.length){
            this.addSteps(stepsToAdd, this.currentIndex + 1);
        }
    }

    async executeStep(current) {
        if (current.command && !current.commandDone) {
            try {
                const res = await this.runCommand(current.command);
                console.log(res);
                if (res) {
                    await VUE.onCommandExecuted(current.command);
                    return true;
                }
            } catch (e) {
                console.error(e)
            }
        } else {
            return true;
        }
        return false;
    }


    async runCommand(command) {
        const cmd = Command.parseCommand(command);
        switch (cmd.type) {
            case Command.CMD_TYPE.echo:
                VUE.logManager.log(cmd.command.replace('echo ', ''));
                return true;
            case Command.CMD_TYPE.reboot:
                this.deviceManager.reboot(cmd.mode);
                return true;
            case Command.CMD_TYPE.connect:
                try {
                    await this.deviceManager.connect(cmd.mode);
                    await this.onDeviceConnected();
                    return true;
                }catch (e) {
                    return false;
                }
            case Command.CMD_TYPE.erase:
                return this.deviceManager.erase(cmd.partition);
            case Command.CMD_TYPE.flash:
                return this.deviceManager.flash(cmd.file, cmd.partition, (done, total) => {
                    VUE.onInstalling(cmd.file, done, total);
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
                         this.deviceManager.unlock(cmd.command);
                    } catch (e) {
                        //on some device, check unlocked does not work but when we try the command, it throws an error with "already unlocked"
                        if (e.bootloaderMessage?.includes("already")) {
                            isUnlocked = true;
                        } else if (e.bootloaderMessage?.includes("not allowed")) {
                            //TODO
                        }
                    }
                }
                if (!isUnlocked) {
                    //it's not unlocked
                    //the unlock command needs for the user to accept unlocking on the device and restarting the phone, like the commands used at the start
                    const stepsToAdd = this.startCommand.concat([
                        this.steps[this.currentIndex]
                    ])
                    this.addSteps(stepsToAdd, this.currentIndex + 1);
                } else {
                    this.steps[this.currentIndex].done = true;
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
                        }
                    }
                }
                if (!isLocked) {
                     this.deviceManager.lock(cmd.command);
                } else {
                    //since it's already locked, let's consider this step finished
                    this.steps[this.currentIndex].done = true;
                }
                return true;
            case Command.CMD_TYPE.sideload:
                await this.deviceManager.sideload(cmd.file);
                return true;
                break;
        }
    }

    addSteps(steps, index) {
        this.steps = [
            ...this.steps.slice(0, index),
            ...steps,
            ...this.steps.slice(index)
        ].map((c, index) => {
            const i = index;
            return Object.assign({}, c
             ,{
                    index: i,
                    id: `step_${i}`
                })
        });
        VUE.clearProcess();
        VUE.renderProcess(this.steps);
        VUE.onStepStarted(this.steps[this.currentIndex]);
    }

    async onDeviceConnected() {
        const serialNumber = this.deviceManager.getSerialNumber();
        const productName = "oneplusnord";//this.deviceManager.getProductName();
        if (this.deviceManager.wasAlreadyConnected(serialNumber)) {
            //already connected
            //we check on serialNumber because productName may not be the same between adb/fastboot driver
        } else {
            try {
                this.model = productName.toLowerCase().replace(/ /g, '');
                this.resources = await (await fetch(`js/resources/${this.model}.json`)).json() || {};
            } catch (e) {
                throw Error('model not supported');
                this.resources = {};
            }
            if (this.resources) {
                this.deviceManager.setResources(this.resources);
                if (this.resources.commands) {
                    this.steps.push(...this.resources.commands.map((c, index) => {
                        const i = index + this.steps.length;
                        return Object.assign({}, {index: i, id: `step_${i}`, mode: 'bootloader'}, c);
                    }));
                }
                VUE.clearProcess();
                VUE.renderProcess(this.steps);
                VUE.onStepStarted(this.steps[this.currentIndex]);
            }
        }
    }

}
