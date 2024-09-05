import {MessageClass} from "../../lib/webadb/message.class.js";
import {MessageHeader} from "../../lib/webadb/message-header.class.js";
import {Device} from "./device.class.js";

const VERSION = 0x01000000;

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
            if (this.device && this.device.isConnected) {
            } else {

                /*this.webusb = await Adb.open("WebUSB"); //Adb.webusb.transport
                if (this.webusb.isAdb()) {
                    this.device = await this.webusb.connectAdb("host::");  //Adb.webusb.Device
                    return true;
                } */                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         
                let adbWebBackend = await AdbWebBackend3.requestDevice();
                if (adbWebBackend) {
                    let adbDevice = new Adb3(adbWebBackend, null); //adb.bundle.js
                    await adbDevice.connect();
                    this.device = adbWebBackend._device;
                    this.webusb = adbDevice;
                    this.adbWebBackend = adbWebBackend;
                    return true;
                }   
            }
           
        } catch (e) {
            this.device = null;
            throw Error(e); // K1ZFP TODO
        }
        return false;
    }

    async sideload(blob, onProgress) {
        try {
            //await this.adbConnect(blob, false);
            await this.adbOpen2(blob, true);
            //this.webusb.sideload(blob);
            return true;
        } catch (e) {
            throw Error(`error sideload failed`); // K1ZFP TODO
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

    async _______adbOpen(blob, useChecksum   ) {
// K1ZFP this one is used by the webadb.js lib that does not works on MacOS
        const transport = this.device.transport;
        if (transport == null)
            return;

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const MAX_PAYLOAD = this.device.max_payload;
        const fileSize = blob.size;
        const service = `sideload-host:${fileSize}:${MAX_PAYLOAD}`; //sideload-host:1381604186:262144

        let data = new DataView(encoder.encode('' + service + '\0').buffer);
        this.stream = await Adb.Stream.open(this.device, service); // Send OPEN message and receive OKAY
        
        let checksum = 0;
        if (useChecksum) {
            checksum = MessageClass.checksum(data);
        }
        const localId = this.stream.local_id;
        const remoteId = this.stream.remote_id;


        let header = new MessageHeader('OKAY', localId, remoteId, 0, checksum);
        let receivedData;
        const hh =  header.toDataView().buffer
        /*
        Index	Valeur (Int8)
        0	79
        1	75
        2	65
        3	89
        4	1
        5	0
        6	0
        7	0
        8	1
        9	0
        10	0
        11	0
        12	0
        13	0
        14	0
        15	0
        16	-35
        17	8
        18	0
        19	0
        20	-80
        21	-76
        22	-66
        23	-90
        */
        await this.write(hh);

        let response_h = await this.read(24);
        /*
        Index	Valeur (Int8)	Interprétation ASCII
        0	87	W
        1	82	R
        2	84	T
        3	69	E
        4	1	
        5	0	
        6	0	
        7	0	
        8	1	
        9	0	
        10	0	
        11	0	
        12	8	
        13	0	
        14	0	
        15	0	
        16	-114	
        17	1	
        18	0	
        19	0	
        20	-88	
        21	-83	
        22	-85	
        23	-70	
        */

        header = MessageHeader.parse(response_h, useChecksum);
        switch (header.cmd) {
            default: {
                if (header.length > 0) { //=8
                    receivedData = await this.read(header.length); //READ... 
                    /*
                    Int8Array(8)
                    0 : 48
                    1 :  48
                    2 :  48
                    3 :  48
                    4 :  53
                    5 :  50
                    6 :  55
                    7 :  48
                    */
                }
            }
        }

        let message = new MessageClass(header, receivedData);
        if (message.header.cmd !== 'WRTE') {
            throw new Error('WRTE Failed');
        }

        while (true) {
            let res = decoder.decode(message.data); //1pass 1 2pass 0  // 5270
            const block = Number(res);

            if (isNaN(block) && res === 'DONEDONE') {
                break;
            }

            const offset = block * MAX_PAYLOAD; //1381498880
            if (offset >= fileSize) { //1381604186
                throw new Error(`adb: failed to read block ${block} past end`);
            }

            let to_write = MAX_PAYLOAD; //105306
            if ((offset + MAX_PAYLOAD) > fileSize) {
                to_write = fileSize - offset; 
            }

            const slice = blob.slice(offset, offset + to_write); //K1ZFP type?
            //cons ole.log("offset to_write", offset, to_write);   // 1 179 254 784
            //cons ole.log("to_write(" + to_write + ") offset(" + offset + ") " + (await slice.arrayBuffer()).byteLength);

            let header = new MessageHeader('WRTE', localId, remoteId, to_write, checksum);
            let hhh = header.toDataView().buffer;
            /*
            0	87	W
            1	82	R
            2	84	T
            3	69	E
            4	1	
            5	0	
            6	0	
            7	0	
            8	1	
            9	0	
            10	0	
            11	0	
            12	90	Z
            13	-101	
            14	1	
            15	0	
            16	-35	
            17	8	
            18	0	
            19	0	
            20	-88	
            21	-83	
            22	-85	
            23	-70	*/
            await this.write(hhh);
            let hhhh = await slice.arrayBuffer();
            await this.write(hhhh);
            /*
            byteLength: 105306
            detached: false
            maxByteLength:  105306
            resizable : false*/

            ///////

            response_h = await this.read(24);
            /*
            Index	Valeur (Int8)	Interprétation ASCII
            0	79	O
            1	75	K
            2	65	A
            3	89	Y
            4	1	
            5	0	
            6	0	
            7	0	
            8	1	
            9	0	
            10	0	
            11	0	
            12	0	
            13	0	
            14	0	
            15	0	
            16	0	
            17	0	
            18	0	
            19	0	
            20	-80	
            21	-76	
            22	-66	
            23	-90	*/
            header = MessageHeader.parse(response_h, useChecksum);
            switch (header.cmd) {
                default: {
                    if (header.length > 0) {
                        receivedData = await this.read(header.length);
                    } else {
                        receivedData = new DataView(encoder.encode("0").buffer);  // 1pass  Here 2nd...
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
            /*

            Index	Valeur (Int8)	Interprétation ASCII
            0	87	W
            1	82	R
            2	84	T
            3	69	E
            4	1	
            5	0	
            6	0	
            7	0	
            8	1	
            9	0	
            10	0	
            11	0	
            12	8	
            13	0	
            14	0	
            15	0	
            16	-128	
            17	1	
            18	0	
            19	0	
            20	-88	
            21	-83	
            22	-85	
            23	-70	*/
            header = MessageHeader.parse(response_h, useChecksum);
            switch (header.cmd) {
                default: {
                    if (header.length > 0) { // 1pass 8
                        receivedData = await this.read(header.length);
                        /*
                        0	48	0
                        1	48	0
                        2	48	0
                        3	48	0
                        4	48	0
                        5	48	0
                        6	48	0
                        7	48	0*/
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

    async adbOpen2(blob, useChecksum) {
        // This one is used by the adb.bundle.js 

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const MAX_PAYLOAD = 0x40000; //K1ZFP TODO
        const fileSize = blob.size;
        const service = `sideload-host:${fileSize}:${MAX_PAYLOAD}`; //ideload-host:1381604186:262144

        let data = new DataView(encoder.encode('' + service + '\0').buffer);
        this.stream = await this.webusb.createStream(service);  // Send Open message and receive OKAY.

        let checksum = 0;
        if (useChecksum) {
            checksum = MessageClass.checksum(data);
        }
        const localId = this.stream.localId;
        const remoteId = this.stream.remoteId;

        let header = new MessageHeader('OKAY', localId, remoteId, 0, checksum);
        let receivedData;
        await this.adbWebBackend.write(header.toDataView().buffer);
        let r = await this.adbWebBackend.read(24);
        let message = new MessageClass(header, r);
        if (message.header.cmd == "OKAY") {
            receivedData = await this.adbWebBackend.read(8);
            message = new MessageClass(header, receivedData);
        } else {
            throw new Error('Write OKAY Failed (init)');
        }
        
        while (true) {
            const res = decoder.decode(message.data);
            const block = Number(res);

            if (isNaN(block) && res === 'DONEDONE') {
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

            let slice = blob.slice(offset, offset + to_write); 
            header = new MessageHeader('WRTE', localId, remoteId, to_write, checksum);
            let buff = await slice.arrayBuffer();
            
            await this.adbWebBackend.write(header.toDataView().buffer)
            await this.adbWebBackend.write(buff);
            r = await this.adbWebBackend.read(24);
            //TODO test OKAY
            header = new MessageHeader('OKAY', localId, remoteId, 0, checksum);
            await this.adbWebBackend.write(header.toDataView().buffer);
            r = await this.adbWebBackend.read(24);
            //TODO Test WRTE
            receivedData = await this.adbWebBackend.read(8);
            message = new MessageClass(header, receivedData);

        }
        return true;
    }

    /*write(data) {
        return this.device.transport.send(this.device.ep_out, data);
        }

    read(l) {
        return this.device.transport.receive(this.device.ep_in, l);
    }*/


}