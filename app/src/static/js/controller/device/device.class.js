export class Device {
    constructor(device) {
        this.device = device;
    }

    async init() {

    }

    async connect() {
        return false;
    }

    isConnected() {
        return false;
    }

    isADB() {
        return false;
    }

    isBootloader() {
        return false;
    }

    isFastboot() {
        return false;
    }

    isRecovery() {
        return false;
    }

    async flashBlob(partition, blob, onProgress) {
        return false;
    }

    async runCommand(cmd) {
        return false;
    }

    getProductName() {
        return undefined;
    }

    getSerialNumber() {
        return undefined;
    }
}