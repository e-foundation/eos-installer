import { AdbCommand, calculateChecksum } from "@yume-chan/adb";
import { Consumable } from "@yume-chan/stream-extra";
import { EmptyUint8Array, decodeUtf8, encodeUtf8 } from "@yume-chan/struct";
import { Device } from "./device.class.js";
import { WDebug } from "../../debug.js";
import { ADB } from "./adb.class.js";

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
        let adbDaemonWebUsbDevice = await ADB.Manager.requestDevice();
        if (typeof adbDaemonWebUsbDevice == "undefined") {
          throw new Error("No device connected (1)");
        }

        try {
          this.connection = await adbDaemonWebUsbDevice.connect();
        } catch (err) {
          console.error(err);
          const devices = await ADB.Manager.getDevices();
          if (!devices.length) {
            throw new Error("No device connected (2)");
          }
          adbDaemonWebUsbDevice = devices[0]; // Assume one device is connected
        }

        this.adbDaemonWebUsbDevice = adbDaemonWebUsbDevice.raw;

        // Filter to identify Android device in adb mode.
        const WebUsbDeviceFilter = {
          classCode: 0xff,
          subclassCode: 0x42,
          protocolCode: 1,
        };

        await this.getInOutEndpoints(WebUsbDeviceFilter);

        const version = 0x01000001;
        const maxPayloadSize = 0x100000;
        await this.sendPacket(
          AdbCommand.Connect,
          version,
          maxPayloadSize,
          "host::\0",
        );
        const r = await this.readOnDevice();

        if (r.value.command == AdbCommand.Connect) {
          //All is fine
        } else {
          throw new Error("Adb sideload connection error");
        }
      }
    } catch (e) {
      this.device = null;
      throw new Error(`Cannot connect Recovery ${e.message || e}`);
    }
  }

  /**
   * Finds and selects the input and output endpoints of a USB device matching a given filter.
   *
   * @async
   * @param {Object} WebUsbDeviceFilter - Filter defining the criteria for selecting USB interfaces.
   * @returns void.
   *
   * @description
   * This function iterates through the configurations of the attached USB device (`adbDaemonWebUsbDevice`)
   * to identify an interface that matches the `WebUsbDeviceFilter` criteria and exits
   * as soon as both endpoints are found (in & out).
   */
  async getInOutEndpoints(WebUsbDeviceFilter) {
    let _a;
    outerLoop: for (const configuration of this.adbDaemonWebUsbDevice
      .configurations) {
      for (const interface_ of configuration.interfaces) {
        for (const alternate of interface_.alternates) {
          if (
            alternate.interfaceSubclass === WebUsbDeviceFilter.subclassCode &&
            alternate.interfaceClass === WebUsbDeviceFilter.classCode &&
            alternate.interfaceSubclass === WebUsbDeviceFilter.subclassCode
          ) {
            if (
              ((_a = this.adbDaemonWebUsbDevice.configuration) === null ||
              _a === void 0
                ? void 0
                : _a.configurationValue) !== configuration.configurationValue
            ) {
              await this.adbDaemonWebUsbDevice.selectConfiguration(
                configuration.configurationValue,
              );
            }
            if (!interface_.claimed) {
              await this.adbDaemonWebUsbDevice.claimInterface(
                interface_.interfaceNumber,
              );
            }
            if (
              interface_.alternate.alternateSetting !==
              alternate.alternateSetting
            ) {
              await this.adbDaemonWebUsbDevice.selectAlternateInterface(
                interface_.interfaceNumber,
                alternate.alternateSetting,
              );
            }
            for (const endpoint of alternate.endpoints) {
              switch (endpoint.direction) {
                case "in":
                  this._inEndpointNumber = endpoint.endpointNumber;
                  if (this._outEndpointNumber !== undefined) {
                    break outerLoop;
                  }
                  break;
                case "out":
                  this._outEndpointNumber = endpoint.endpointNumber;
                  if (this._inEndpointNumber !== undefined) {
                    break outerLoop;
                  }
                  break;
              }
            }
          }
        }
      }
    }
  }

  async readOnDevice() {
    const reader = await this.connection?.readable?.getReader();
    if (!reader) {
      throw new Error("readOnDevice() : Unable to read on device");
    }
    const r = await reader.read();
    reader.releaseLock();
    return r;
  }

  async sendPacket(command, arg0, arg1, payload) {
    const writer = this.connection?.writable?.getWriter();
    if (!writer) {
      throw new Error("sendPacket() : Unable to write on device");
    }

    if (typeof payload === "string") {
      payload = encodeUtf8(payload);
    }

    const checksum = payload ? calculateChecksum(payload) : 0;
    const magic = command ^ 0xffffffff;
    await Consumable.WritableStream.write(writer, {
      command: command,
      arg0: arg0,
      arg1: arg1,
      payload: payload,
      checksum: checksum,
      magic: magic,
    });
    writer.releaseLock();
  }

  async createStream(service) {
    const localId = 1; // Assume one device is connected
    service += "\0";
    let remoteId;
    await this.sendPacket(AdbCommand.Open, localId, 0, service);
    const r = await this.readOnDevice();
    if (r.value.command == AdbCommand.Okay) {
      remoteId = r.value.arg0;
      return { localId: localId, remoteId: remoteId };
    } else {
      throw new Error("Adb sideload create stream error");
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
    const MAX_PAYLOAD = 0x10000;
    const fileSize = blob.size;
    const service = `sideload-host:${fileSize}:${MAX_PAYLOAD}`; //sideload-host:1381604186:262144

    this.stream = await this.createStream(service); // Send Open message and receive OKAY.

    const localId = this.stream.localId;
    const remoteId = this.stream.remoteId;

    let message;
    await this.sendPacket(AdbCommand.Okay, localId, remoteId, EmptyUint8Array);
    const r = await this.readOnDevice();

    if (r.value.command == AdbCommand.Write) {
      message = {
        data: r.value.payload,
      };
    } else {
      throw new Error("Write OKAY Failed (init)");
    }

    while (true) {
      const res = decodeUtf8(message.data);
      const block = Number(res);

      if (isNaN(block) && res === "DONEDONE") {
        WDebug.log("DONEDONE");
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
      let buff = await slice.arrayBuffer();

      await this.sendPacket(
        AdbCommand.Write,
        localId,
        remoteId,
        new Uint8Array(buff),
      );
      const r = await this.readOnDevice();

      if (r.value.command == AdbCommand.Okay) {
        await this.sendPacket(
          AdbCommand.Okay,
          localId,
          remoteId,
          EmptyUint8Array,
        );
        const r = await this.readOnDevice();

        if (r.value.command == AdbCommand.Write) {
          message = {
            data: r.value.payload,
          };
        } else {
          console.error("Error sideload (A)", r);
          throw new Error(`WRTE Failed ${block}`);
        }
      } else {
        console.error("Error sideload (B)", r);
        throw new Error("Write OKAY Failed (init)");
      }
    }
    return true;
  }
}
