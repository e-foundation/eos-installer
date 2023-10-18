import * as fastboot from "../../lib/fastboot/fastboot.mjs";
import {TimeoutError} from "../../lib/fastboot/fastboot.mjs";
import {Device} from "./device.class.js";

/**
 * wrap fastboot interactions
 * */
export class Bootloader extends Device {

    constructor() {
        super(new fastboot.FastbootDevice());
    }

    async init() {
        //await this.blobStore.init();
        fastboot.configureZip({
            workerScripts: {
                inflate: ["../dist/vendor/z-worker-pako.js", "pako_inflate.min.js"],
            },
        });
        // Enable verbose debug logging
        fastboot.setDebugLevel(2);
    }

    reboot(mode) {
        return this.device.reboot(mode);
    }

    runCommand(command) {
        return this.device.runCommand(command);
    }

    isConnected() {
        return this.device.isConnected;
    }

    isBootloader() {
        return true;
    }

    async connect() {
        let _count = 0;
        const MAX_COUNT = 25;
        let connected = true;
        while (true) {
            try {
                await this.device.connect();
                break;
            } catch (error) {
                _count++;
                if (_count > MAX_COUNT) {
                    throw new Error(error);
                    break;
                }
            }
            await VUE.onWaiting();
            //sleep before trying again
            await new Promise(r => setTimeout(r, 500));
        }
        return this.device.device;
    }

    getProductName() {
        return this.device.device.productName;
    }

    getSerialNumber() {
        return this.device.device.serialNumber;
    }

    async flashFactoryZip(blob, onProgress, onReconnect) {
        try {
            await this.device.flashFactoryZip(
                blob,
                false,
                onReconnect,
                // Progress callback
                (action, item, progress) => {
                    let userAction = fastboot.USER_ACTION_MAP[action];
                    onProgress(userAction, item, progress);
                }
            );
        } catch (e) {
            throw e;
        }
    }

    async flashBlob(partition, blob, onProgress) {
        try {
            await this.device.flashBlob(
                partition,
                blob,
                (progress) => {
                    onProgress(progress * blob.size, blob.size, partition);
                }
            );
            return true;
        } catch (e) {
            if (e instanceof TimeoutError) {
                console.log(e)
                return await this.flashBlob(partition, blob, onProgress);
            } else {
                console.log(e)
                throw e;
            }
            return false;
        }
    }

    async isUnlocked(variable) {
        if (this.device && this.device.isConnected) {
            try {
                const unlocked = await this.device.getVariable(variable);
                return !(!unlocked || unlocked === 'no');
            } catch (e) {
                console.error(e);
                throw e;
            }
        }
        return false;
    }

    async isLocked(variable) {
        if (this.device && this.device.isConnected) {
            try {
                const unlocked = await this.device.getVariable(variable);
                return !unlocked || unlocked === 'no';
            } catch (e) {
                console.error(e);
                throw e;
            }
        }
        return false;
    }

    async unlock(command) {
        if (command) {
            const res = await this.device.runCommand(command);
        } else {
            throw Error('no unlock command configured');
        }
    }

    async lock(command) {
        if (command) {
            try {
                const res = await this.device.runCommand(command);
                return !(await this.isUnlocked());
            } catch (e) {
                throw e;
            }
        } else {
            throw Error('no lock command configured');
        }
    }


}