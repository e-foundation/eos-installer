import {MessageHeader} from "./message-header.class.js";

export class MessageClass {
    constructor(header, data) {
        this.header = header;
        this.data = data;
    }

    /**
     * Returns the data content as a {@link string} or {@link null} if data is not available.
     * @returns {string | null} a {@link string} or {@link null} if data is not available.
     */
    dataAsString() {
        if (!this.data) {
            return null;
        }
        const textDecoder = new TextDecoder();
        return textDecoder.decode(this.data);
    }

    /**
     * Creates a new Message. See {@link MessageHeader}.
     * @param {string} cmd the command.
     * @param {number} arg0 value for the first argument.
     * @param {number} arg1 value for the second argument.
     * @param {boolean} useChecksum if the checksum for the data should be calculated.
     * @param {DataView} data message data.
     * @returns {MessageClass} a new Message
     */
    static newMessage(cmd, arg0, arg1, useChecksum, data) {
        let checksum = 0;
        let byteLength = 0;
        if (data) {
            byteLength = data.byteLength;
            if (useChecksum) {
                checksum = MessageClass.checksum(data);
            }
        }
        const header = new MessageHeader.MessageHeader(cmd, arg0, arg1, byteLength, checksum);
        return new MessageClass(header, data);
    }

    /**
     * Creates a new `OPEN` message.
     * @param {number} localId local stream ID
     * @param {number} remoteId remote stream ID.
     * @param {string} service service description
     * @param {boolean} useChecksum if the checksum for the data should be calculated.
     * @returns {MessageClass} a correctly setup message with an 'OPEN' command
     */
    static open(localId, remoteId, service, useChecksum) {
        const encoder = new TextEncoder();
        const data = new DataView(encoder.encode('' + service + '\0').buffer);
        return MessageClass.newMessage('OPEN', localId, remoteId, useChecksum, data);
    }

    /**
     * Creates a new `CNXN` message.
     * @param {number} version version of the protocol to be used.
     * @param {number} maxPayload maximum payload size for the connection.
     * @param {string} banner host description.
     * @param {boolean} useChecksum if the checksum for the data should be calculated.
     * @returns {MessageClass} a correctly setup message with an 'CNXN' command
     */
    static cnxn(version, maxPayload, banner, useChecksum) {
        const encoder = new TextEncoder();
        const data = new DataView(encoder.encode(banner).buffer);
        return MessageClass.newMessage('CNXN', version, maxPayload, useChecksum, data);
    }

    /**
     * Creates a new `AUTH` message, with the a signed token.
     * @param {DataView} signedToken a DataView with the signed token.
     * @param {boolean} useChecksum if the checksum for the data should be calculated.
     * @returns {MessageClass} a correctly setup message with an 'AUTH' command
     */
    static authSignature(signedToken, useChecksum) {
        return MessageClass.newMessage('AUTH', 2, 0, useChecksum, signedToken);
    }

    /**
     * Creates a new `AUTH` message, with the a Public Key.
     * @param {DataView} publicKey a DataView with the public key
     * @param {boolean} useChecksum if the checksum for the data should be calculated.
     * @returns {MessageClass} a correctly setup message with an 'AUTH' command
     */
    static authPublicKey(publicKey, useChecksum) {
        const textEncoder = new TextEncoder();
        const data = textEncoder.encode(Helper.toB64(publicKey.buffer) + '\0');
        return MessageClass.newMessage('AUTH', 3, 0, useChecksum, new DataView(data.buffer));
    }

    /**
     * Creates a new `SYNC` message, with the a Public Key.
     * @param
     * @returns {MessageClass}
     *
     [4 octets] : "SYNC" en ASCII
     [4 octets] : longueur du nom de service (4 en ASCII, soit 0x34 en hexadécimal)
     [4 octets] : longueur des données (0)
     [16 octets] : nom de service ("sideload")
     */
    static sync(publicKey, useChecksum) {
        const textEncoder = new TextEncoder();
        const data = textEncoder.encode(Helper.toB64(publicKey.buffer) + '\0');
        return MessageClass.newMessage('SYNC', 3, 0, useChecksum, new DataView(data.buffer));
    }

    /**
     * Creates a new `SEND` message, with the a Public Key.
     * @param
     * @returns {MessageClass}
     [4 octets] : "SEND" en ASCII
     [4 octets] : longueur du nom de service (4 en ASCII, soit 0x34 en hexadécimal)
     [4 octets] : longueur des données (maximal selon la réponse à la requête CNXN)
     [16 octets] : nom de service ("sideload")
     [data] : données du fichier de mise à jour, avec une longueur égale à la longueur des données envoyées dans l'en-tête du message
     */
    static send(publicKey, useChecksum) {
        const textEncoder = new TextEncoder();
        const data = textEncoder.encode(Helper.toB64(publicKey.buffer) + '\0');
        return MessageClass.newMessage('SEND', 3, 0, useChecksum, new DataView(data.buffer));
    }

    /**
     * Creates a new `DONE` message, with the a Public Key.
     * @param
     * @returns {MessageClass}
     [4 octets] : "DONE" en ASCII
     [4 octets] : longueur du nom de service (4 en ASCII, soit 0x34 en hexadécimal)
     [4 octets] : longueur des données (0)
     [16 octets] : nom de service ("sideload")

     Ces messages doivent être envoyés dans l'ordre ci-dessus et avec les valeurs appropriées pour les champs d'en-tête, tels que la longueur maximale des paquets et le numéro de série généré par le client ADB.
     */
    static done(publicKey, useChecksum) {
        const textEncoder = new TextEncoder();
        const data = textEncoder.encode(Helper.toB64(publicKey.buffer) + '\0');
        return MessageClass.newMessage('DONE', 3, 0, useChecksum, new DataView(data.buffer));
    }

    static checksum(dataView) {
        let sum = 0;
        for (let i = 0; i < dataView.byteLength; i++) {
            sum += dataView.getUint8(i);
        }
        return sum & 0xffffffff;
    }
}