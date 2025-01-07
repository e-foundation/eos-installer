export class Device {
  constructor(device) {
    this.device = device;
  }

  async init() {}

  async connect() {}

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

  async flashBlob() {
    return false;
  }

  async runCommand() {
    return false;
  }

  getProductName() {
    return undefined;
  }

  getSerialNumber() {
    return undefined;
  }
  async getAndroidVersion() {
    return undefined;
  }

  reboot() {
    return undefined;
  }

  async bootBlob() {
    return false;
  }
}
