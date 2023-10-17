import {Helper} from "./helper.class.js";

export class MessageHeader {
    /**
     * Creates a new MessageHeader
     *
     * @param {string} cmd The command that this message represents.
     * @param {number} arg0 The meaning depends on the command.
     * @param {number} arg1 The meaning depends on the command.
     * @param {number} length The length of the data part of the message.
     * @param {number} checksum Checksum for the data part of the message. Only used in version 0x01000000 of the
     * protocol.
     *
     *
     */
    constructor(cmd, arg0, arg1, length, checksum) {
        this.cmd = cmd;
        this.arg0 = arg0;
        this.arg1 = arg1;
        this.length = length;
        this.checksum = checksum;
    }

    /**
     * Converts the MessageHeader into a {@link DataView}.
     * @returns {DataView} a DataView with 24 bytes, with the header content.
     */
    toDataView() {
        const view = new DataView(new ArrayBuffer(24));
        const rawCmd = Helper.encodeCmd(this.cmd);
        const magic = rawCmd ^ 0xffffffff;
        view.setUint32(0, rawCmd, true);
        view.setUint32(4, this.arg0, true);
        view.setUint32(8, this.arg1, true);
        view.setUint32(12, this.length, true);
        view.setUint32(16, this.checksum, true);
        view.setUint32(20, magic, true);
        return view;
    }

    /**
     * Creates a header from a {@link DataView}.
     * @param {DataView} data the {@link DataView} that will be used to create the header.
     * @param {boolean} useChecksum if the checksum should be verified.
     */
    static parse(data, useChecksum = false) {
        const cmd = data.getUint32(0, true);
        const arg0 = data.getUint32(4, true);
        const arg1 = data.getUint32(8, true);
        const len = data.getUint32(12, true);
        const checksum = data.getUint32(16, true);
        // Android seems to have stopped providing checksums
        if (useChecksum && data.byteLength > 20) {
            const magic = data.getUint32(20, true);
            if ((cmd ^ magic) !== -1) {
                throw new Error('magic mismatch');
            }
        }
        return new MessageHeader(Helper.decodeCmd(cmd), arg0, arg1, len, checksum);
    }
}