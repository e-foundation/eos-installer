import { ADB } from "./adb.class.js";
import { Device } from "./device.class.js";
import { WDebug } from "../../debug.js";

import { AdbSideload, MessageClass, MessageHeader } from "../adb-sideload.js"

export class Recovery extends Device {
  constructor(device) {
    super(device);
    this.webusb = null;
    this.count = 0;
    this.adbWebBackend = null;
  }

  async isConnected() {
    if (!this.device) {
      return false;
    }
    try {
      return this.device.getDevice();
    } catch {
      return false;
    }
  }

  isRecovery() {
    return true;
  }

  async connect() {
    try {
      if (this.device && this.device.isConnected) {
        WDebug.log("Connect recovery the device is connected");
      } else {
        const adbDaemonWebUsbDevice = await ADB.Manager.requestDevice(); /*AdbDaemonWebUsbDevice*/
        const adbDevice = new AdbSideload(adbDaemonWebUsbDevice.raw, null);
        WDebug.log("adbDevice = ", adbDevice);
        await adbDevice.connect();  

        this.device = adbDaemonWebUsbDevice; 
        this.webusb = adbDevice; 
      }
    } catch (e) {
      this.device = null;
      throw new Error(`Cannot connect Recovery ${e.message || e}`);
    }
  }

  async sideload(blob) {
    try {
      await this.adbOpen(blob);
    } catch (e) {
      throw new Error(`Sideload fails ${e.message || e}`);
    }
  }

  async reboot(mode) {
    return await this.device.shell(`reboot ${mode}`);
  }

  getProductName() {
    return this.webusb.name;
  }

  getSerialNumber() {
    return this.webusb.product;
  }

  async adbOpen(blob) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const MAX_PAYLOAD = 0x40000;
    const fileSize = blob.size;
    const service = `sideload-host:${fileSize}:${MAX_PAYLOAD}`; //sideload-host:1381604186:262144

    let data = new DataView(encoder.encode("" + service + "\0").buffer);
    this.stream = await this.webusb.createStream(service); // Send Open message and receive OKAY.

    let checksum = MessageClass.checksum(data);

    const localId = this.stream.localId;
    const remoteId = this.stream.remoteId;
    

    let header = new MessageHeader("OKAY", localId, remoteId, 0, checksum);
    let receivedData, message;
    await this.webusb.backend.write(header.toDataView().buffer);
    let r = await this.webusb.backend.read(24);
    let v = Array.from(new Uint8Array(r))
      .map((byte) => String.fromCharCode(byte))
      .join("");
    if (v[0] == "W" && v[1] == "R" && v[2] == "T" && v[3] == "E") {
      receivedData = await this.webusb.backend.read(8);
      message = new MessageClass(header, receivedData);
    } else {
      throw new Error("Write OKAY Failed (init)");
    }

    while (true) {
      const res = decoder.decode(message.data);
      const block = Number(res);

      if (isNaN(block) && res === "DONEDONE") {
        break;
      } else {
        if (block % 10 == 0) {
          WDebug.log("Sideloading " + block);
        }
      }

      const offset = block * MAX_PAYLOAD;
      if (offset >= fileSize) {
        throw new Error(`adb: failed to read block ${block} past end`);
      }

      let to_write = MAX_PAYLOAD;
      if (offset + MAX_PAYLOAD > fileSize) {
        to_write = fileSize - offset;
      }

      let slice = blob.slice(offset, offset + to_write);
      header = new MessageHeader("WRTE", localId, remoteId, to_write, checksum);
      let buff = await slice.arrayBuffer();

      await this.webusb.backend.write(header.toDataView().buffer);
      await this.webusb.backend.write(buff);
      r = await this.webusb.backend.read(24);
      v = Array.from(new Uint8Array(r))
        .map((byte) => String.fromCharCode(byte))
        .join("");
      //test OKAY
      if (v[0] == "O" && v[1] == "K" && v[2] == "A" && v[3] == "Y") {
        header = new MessageHeader("OKAY", localId, remoteId, 0, checksum);
        await this.webusb.backend.write(header.toDataView().buffer);
        r = await this.webusb.backend.read(24);
        v = Array.from(new Uint8Array(r))
          .map((byte) => String.fromCharCode(byte))
          .join("");
        //Test WRTE
        if (v[0] == "W" && v[1] == "R" && v[2] == "T" && v[3] == "E") {
          receivedData = await this.webusb.backend.read(8);
          message = new MessageClass(header, receivedData);
        } else {
          throw new Error(`WRTE Failed ${block}`);
        }
      } else {
        throw new Error(`OKAY Failed ${block}`);
      }
    }
    return true;
  }
}
