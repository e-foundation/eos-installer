import {MessageClass} from "../../lib/webadb/message.class.js";
import {MessageHeader} from "../../lib/webadb/message-header.class.js";
import {Device} from "./device.class.js";

const VERSION = 0x01000000;
const VERSION_NO_CHECKSUM = 0x01000001;

export class Recovery extends Device {
    constructor(device) {
        super(device);
        this.webusb = null;
    }

    async isConnected() {
        if (!this.device) {
            return false;
        }
        try {
            return this.device.getDevice();
        } catch (e) {
            return false;
        }
    }

    isRecovery() {
        return true;
    }

    async connect() {
        try {
            if(this.device && this.device.isConnected) {
            } else {
                this.webusb = await Adb.open("WebUSB");
            }
            if (this.webusb.isAdb()) {
                this.device =  await this.webusb.connectAdb("host::");
                return true;
            }
        } catch (e) {
            this.device = null;
            throw Error(e);
        }
        return false;
    }
    async sideload(blob, onProgress) {
        try {
            await this.adbConnect(blob, false);
            await this.adbOpen(blob, true);
            return true;
        } catch (e) {
            console.log(e);
            throw Error(`error sideload failed`);
        }
    }

    async adbConnect(blob, useChecksum) {

        if (this.device == null)
            return;

        const MAX_PAYLOAD = this.device.max_payload;
        const fileSize = blob.size;
        const service = `sideload-host:${fileSize}:${MAX_PAYLOAD}`;
        const version = VERSION;
        //const cnxn = Message.cnxn(version, MAX_PAYLOAD, MACHINE_BANNER, this.options.useChecksum);
        const encoder = new TextEncoder();
        const data = new DataView(encoder.encode(service).buffer);
        let checksum = 0;
        let byteLength = 0;
        byteLength = data.byteLength;
        if (useChecksum) {
            checksum = MessageClass.checksum(data);
        }

        let header = new MessageHeader('CNXN', version, MAX_PAYLOAD, byteLength, checksum);


        await this.write(header.toDataView().buffer);
        await this.write(data.buffer);

        const response = await this.read(24);

        if (!response) {
            throw new Error('Response didn\'t contain any data');
        }
        const response_h = response;

        header = MessageHeader.parse(response_h, useChecksum);
        let receivedData;
        switch (header.cmd) {
            default: {
                if (header.length > 0) {
                    const r = await this.read(header.length);
                    if (!r) {
                        throw new Error('Response didn\'t contain any data');
                    }
                    receivedData = r;
                }
            }
        }
        const message = new MessageClass(header, receivedData);

        // Server connected
        if (message.header.cmd === 'CNXN') {
            if (!message.data) {
                throw new Error('Connection doesn\'t have data');
            }
            return;
        }

        throw new Error('No CNXN');

    }

    async reboot(mode) {
        return await this.device.shell(`reboot ${mode}`);
    }

    getProductName(){
        return this.webusb.device.productName;
    }
    getSerialNumber(){
        return this.webusb.device.serialNumber;
    }

    async adbOpen(blob, useChecksum) {

        const transport = this.device.transport;
        if (transport == null)
            return;

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const MAX_PAYLOAD = this.device.max_payload;
        const fileSize = blob.size;
        const service = `sideload-host:${fileSize}:${MAX_PAYLOAD}`;

        let data = new DataView(encoder.encode('' + service + '\0').buffer);
        this.stream = await Adb.Stream.open(this.device, service);
        let checksum = 0;
        if (useChecksum) {
            checksum = MessageClass.checksum(data);
        }
        const localId = this.stream.local_id;
        const remoteId = this.stream.remote_id;


        let header = new MessageHeader('OKAY', localId, remoteId, 0, checksum);
        let receivedData;
        await this.write(header.toDataView().buffer);

        let response_h = await this.read(24);
        header = MessageHeader.parse(response_h, useChecksum);
        switch (header.cmd) {
            default: {
                if (header.length > 0) {
                    receivedData = await this.read(header.length);
                }
            }
        }

        let message = new MessageClass(header, receivedData);
        if (message.header.cmd !== 'WRTE') {
            throw new Error('WRTE Failed');
        }

        while (true) {
            const res = decoder.decode(message.data);
            const block = Number(res);

            if (isNaN(block) && res === 'DONEDONE') {
                console.log("transfer done");
                break;
            }

            const offset = block * MAX_PAYLOAD;
            if (offset >= fileSize) {
                throw new Error(`adb: failed to read block ${block} past end`);
            }

            let to_write = MAX_PAYLOAD;
            if ((offset + MAX_PAYLOAD) > fileSize) {
                to_write = fileSize - offset;
            }

            const slice = blob.slice(offset, offset + to_write); //K1ZFP type?
            //console.log("offset to_write", offset, to_write);   // 1 179 254 784
            console.log("to_write(" + to_write + ") offset(" + offset + ") " + (await slice.arrayBuffer()).byteLength);

            let header = new MessageHeader('WRTE', localId, remoteId, to_write, checksum);

            await this.write(header.toDataView().buffer);
            await this.write(await slice.arrayBuffer());

            ///////

            response_h = await this.read(24);
            header = MessageHeader.parse(response_h, useChecksum);
            switch (header.cmd) {
                default: {
                    if (header.length > 0) {
                        receivedData = await this.read(header.length);
                    } else {
                        receivedData = new DataView(encoder.encode("0").buffer);
                    }
                }
            }
            message = new MessageClass(header, receivedData);

            if (message.header.cmd !== 'OKAY') {
                throw new Error('WRTE Failed');
            }

            header = new MessageHeader('OKAY', localId, remoteId, 0, checksum);
            await this.write(header.toDataView().buffer);

            response_h = await this.read(24);
            header = MessageHeader.parse(response_h, useChecksum);
            switch (header.cmd) {
                default: {
                    if (header.length > 0) {
                        receivedData = await this.read(header.length);
                    }
                }
            }

            message = new MessageClass(header, receivedData);

            if (message.header.cmd !== 'WRTE') {
                throw new Error('WRTE Failed');
            }
        }
        return true;
    }
    write(data) {
        return this.device.transport.send(this.device.ep_out, data);
    }

    read(l) {
        return this.device.transport.receive(this.device.ep_in, l);
    }


}