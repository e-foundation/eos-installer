import { AdbCommand,
         AutoResetEvent
 } from "@yume-chan/adb";

import { AsyncOperationManager } from "@yume-chan/async";


// ADB Message structures
// There are probably equivalents in the new adb library. 

export class MessageClass {
    constructor(header, data) {
        this.header = header;
        this.data = data;
    }

    static checksum(dataView) {
        let sum = 0;
        for (let i = 0; i < dataView.byteLength; i++) {
            sum += dataView.getUint8(i);
        }
        return sum & 0xffffffff;
    }
}

export class MessageHeader {

    constructor(cmd, arg0, arg1, length, checksum) {
        this.cmd = cmd;
        this.arg0 = arg0;
        this.arg1 = arg1;
        this.length = length;
        this.checksum = checksum;
    }

    toDataView() {
        const view = new DataView(new ArrayBuffer(24));
        const rawCmd = this.encodeCmd(this.cmd);
        const magic = rawCmd ^ 0xffffffff;
        view.setUint32(0, rawCmd, true);
        view.setUint32(4, this.arg0, true);
        view.setUint32(8, this.arg1, true);
        view.setUint32(12, this.length, true);
        view.setUint32(16, this.checksum, true);
        view.setUint32(20, magic, true);
        return view;
    }

    encodeCmd(cmd) {
        const encoder = new TextEncoder();
        const buffer = encoder.encode(cmd).buffer;
        const view = new DataView(buffer);
        return view.getUint32(0, true);
    }
}

/*
Classes and utilities from an old adb lib.
There are probably equivalents in the new adb library. 
It would be interesting to find them, but it may be rather difficult (name change and perhaps synthetics).
*/

const BackingField = Symbol('BackingField');
function getBackingField(object, field) {
    return object[BackingField][field];
}
function setBackingField(object, field, value) {
    object[BackingField][field] = value;
}
function defineSimpleAccessors(object, field) {
    Object.defineProperty(object, field, {
        configurable: true,
        enumerable: true,
        get() { return getBackingField(object, field); },
        set(value) { setBackingField(object, field, value); },
    });
}

var Array;
(function (Array) {
    let SubType;
    (function (SubType) {
        SubType[SubType["ArrayBuffer"] = 0] = "ArrayBuffer";
        SubType[SubType["String"] = 1] = "String";
    })(SubType = Array.SubType || (Array.SubType = {}));
    function initialize(object, field, value) {
        switch (field.subType) {
            case SubType.ArrayBuffer:
                Object.defineProperty(object, field.name, {
                    configurable: true,
                    enumerable: true,
                    get() {
                        return getBackingField(object, field.name).buffer;
                    },
                    set(buffer) {
                        setBackingField(object, field.name, { buffer });
                    },
                });
                break;
            case SubType.String:
                Object.defineProperty(object, field.name, {
                    configurable: true,
                    enumerable: true,
                    get() {
                        return getBackingField(object, field.name).string;
                    },
                    set(string) {
                        setBackingField(object, field.name, { string });
                    },
                });
                break;
            default:
                throw new Error('Unknown type');
        }
        setBackingField(object, field.name, value);
    }
    Array.initialize = initialize;
})(Array || (Array = {}));

const registry = {};
function getFieldTypeDefinition(type) {
    return registry[type];
}
function registerFieldTypeDefinition(_field, _initExtra, methods) {
    registry[methods.type] = methods;
}

var FieldType;
(function (FieldType) {
    FieldType[FieldType["Number"] = 0] = "Number";
    FieldType[FieldType["FixedLengthArray"] = 1] = "FixedLengthArray";
    FieldType[FieldType["VariableLengthArray"] = 2] = "VariableLengthArray";
})(FieldType || (FieldType = {}));

function placeholder() {
    return undefined;
}

registerFieldTypeDefinition(placeholder(), placeholder(), {
    type: FieldType.FixedLengthArray,
    async deserialize({ context, field }) {
        const buffer = await context.read(field.options.length);
        switch (field.subType) {
            case Array.SubType.ArrayBuffer:
                return { value: buffer };
            case Array.SubType.String:
                return {
                    value: context.decodeUtf8(buffer),
                    extra: buffer
                };
            default:
                throw new Error('Unknown type');
        }
    },
    getSize({ field }) {
        return field.options.length;
    },
    initialize({ extra, field, object, value }) {
        const backingField = {};
        if (typeof value === 'string') {
            backingField.string = value;
            if (extra) {
                backingField.buffer = extra;
            }
        }
        else {
            backingField.buffer = value;
        }
        Array.initialize(object, field, backingField);
    },
    serialize({ context, dataView, field, object, offset }) {
        var _a;
        const backingField = getBackingField(object, field.name);
        (_a = backingField.buffer) !== null && _a !== void 0 ? _a : (backingField.buffer = context.encodeUtf8(backingField.string));
        new Uint8Array(dataView.buffer).set(new Uint8Array(backingField.buffer), offset);
    }
});

var Number$1;
(function (Number) {
    let SubType;
    (function (SubType) {
        SubType[SubType["Uint8"] = 0] = "Uint8";
        SubType[SubType["Uint16"] = 1] = "Uint16";
        SubType[SubType["Int32"] = 2] = "Int32";
        SubType[SubType["Uint32"] = 3] = "Uint32";
        SubType[SubType["Uint64"] = 4] = "Uint64";
        SubType[SubType["Int64"] = 5] = "Int64";
    })(SubType = Number.SubType || (Number.SubType = {}));
    Number.SizeMap = {
        [SubType.Uint8]: 1,
        [SubType.Uint16]: 2,
        [SubType.Int32]: 4,
        [SubType.Uint32]: 4,
        [SubType.Uint64]: 8,
        [SubType.Int64]: 8,
    };
    Number.DataViewGetterMap = {
        [SubType.Uint8]: 'getUint8',
        [SubType.Uint16]: 'getUint16',
        [SubType.Int32]: 'getInt32',
        [SubType.Uint32]: 'getUint32',
        [SubType.Uint64]: 'getBigUint64',
        [SubType.Int64]: 'getBigInt64',
    };
    Number.DataViewSetterMap = {
        [SubType.Uint8]: 'setUint8',
        [SubType.Uint16]: 'setUint16',
        [SubType.Int32]: 'setInt32',
        [SubType.Uint32]: 'setUint32',
        [SubType.Uint64]: 'setBigUint64',
        [SubType.Int64]: 'setBigInt64',
    };
})(Number$1 || (Number$1 = {}));
registerFieldTypeDefinition(placeholder(), undefined, {
    type: FieldType.Number,
    getSize({ field }) {
        return Number$1.SizeMap[field.subType];
    },
    async deserialize({ context, field, options }) {
        const buffer = await context.read(Number$1.SizeMap[field.subType]);
        const view = new DataView(buffer);
        const value = view[Number$1.DataViewGetterMap[field.subType]](0, options.littleEndian);
        return { value };
    },
    serialize({ dataView, field, object, offset, options }) {
        dataView[Number$1.DataViewSetterMap[field.subType]](offset, object[field.name], options.littleEndian);
    },
});

var VariableLengthArray;
(function (VariableLengthArray) {
    let EmptyBehavior;
    (function (EmptyBehavior) {
        EmptyBehavior[EmptyBehavior["Undefined"] = 0] = "Undefined";
        EmptyBehavior[EmptyBehavior["Empty"] = 1] = "Empty";
    })(EmptyBehavior = VariableLengthArray.EmptyBehavior || (VariableLengthArray.EmptyBehavior = {}));
    function getLengthBackingField(object, field) {
        return getBackingField(object, field.options.lengthField);
    }
    VariableLengthArray.getLengthBackingField = getLengthBackingField;
    function setLengthBackingField(object, field, value) {
        setBackingField(object, field.options.lengthField, value);
    }
    VariableLengthArray.setLengthBackingField = setLengthBackingField;
    function initialize(object, field, value, context) {
        Array.initialize(object, field, value);
        const descriptor = Object.getOwnPropertyDescriptor(object, field.name);
        delete object[field.name];
        switch (field.subType) {
            case Array.SubType.ArrayBuffer:
                Object.defineProperty(object, field.name, {
                    ...descriptor,
                    set(buffer) {
                        var _a;
                        descriptor.set.call(object, buffer);
                        setLengthBackingField(object, field, (_a = buffer === null || buffer === void 0 ? void 0 : buffer.byteLength) !== null && _a !== void 0 ? _a : 0);
                    },
                });
                delete object[field.options.lengthField];
                Object.defineProperty(object, field.options.lengthField, {
                    configurable: true,
                    enumerable: true,
                    get() {
                        return getLengthBackingField(object, field);
                    }
                });
                break;
            case Array.SubType.String:
                Object.defineProperty(object, field.name, {
                    ...descriptor,
                    set(string) {
                        descriptor.set.call(object, string);
                        if (string) {
                            setLengthBackingField(object, field, undefined);
                        }
                        else {
                            setLengthBackingField(object, field, 0);
                        }
                    },
                });
                delete object[field.options.lengthField];
                Object.defineProperty(object, field.options.lengthField, {
                    configurable: true,
                    enumerable: true,
                    get() {
                        let value = getLengthBackingField(object, field);
                        if (value === undefined) {
                            const backingField = getBackingField(object, field.name);
                            const buffer = context.encodeUtf8(backingField.string);
                            backingField.buffer = buffer;
                            value = buffer.byteLength;
                            setLengthBackingField(object, field, value);
                        }
                        return value;
                    }
                });
                break;
            default:
                throw new Error('Unknown type');
        }
        setBackingField(object, field.name, value);
        if (value.buffer) {
            setLengthBackingField(object, field, value.buffer.byteLength);
        }
    }
    VariableLengthArray.initialize = initialize;
})(VariableLengthArray || (VariableLengthArray = {}));
registerFieldTypeDefinition(placeholder(), placeholder(), {
    type: FieldType.VariableLengthArray,
    async deserialize({ context, field, object }) {
        let length = object[field.options.lengthField];
        if (typeof length === 'string') {
            length = Number.parseInt(length, 10);
        }
        if (length === 0) {
            if (field.options.emptyBehavior === VariableLengthArray.EmptyBehavior.Empty) {
                switch (field.subType) {
                    case Array.SubType.ArrayBuffer:
                        return { value: new ArrayBuffer(0) };
                    case Array.SubType.String:
                        return { value: '', extra: new ArrayBuffer(0) };
                    default:
                        throw new Error('Unknown type');
                }
            }
            else {
                return { value: undefined };
            }
        }
        const buffer = await context.read(length);
        switch (field.subType) {
            case Array.SubType.ArrayBuffer:
                return { value: buffer };
            case Array.SubType.String:
                return {
                    value: context.decodeUtf8(buffer),
                    extra: buffer
                };
            default:
                throw new Error('Unknown type');
        }
    },
    getSize() { return 0; },
    getDynamicSize({ field, object }) {
        return object[field.options.lengthField];
    },
    initialize({ context, extra, field, object, value }) {
        const backingField = {};
        if (typeof value === 'string') {
            backingField.string = value;
            if (extra) {
                backingField.buffer = extra;
            }
        }
        else {
            backingField.buffer = value;
        }
        Array.initialize(object, field, backingField);
        VariableLengthArray.initialize(object, field, backingField, context);
    },
    serialize({ dataView, field, object, offset }) {
        const backingField = getBackingField(object, field.name);
        new Uint8Array(dataView.buffer).set(new Uint8Array(backingField.buffer), offset);
    },
});

const StructDefaultOptions = {
    littleEndian: false,
};

class Struct {
    constructor(options = StructDefaultOptions) {
        this._size = 0;
        this.fields = [];
        this._extra = {};
        this.array = (name, type, options) => {
            if ('length' in options) {
                return this.field({
                    type: FieldType.FixedLengthArray,
                    name,
                    subType: type,
                    options: options,
                });
            }
            else {
                return this.field({
                    type: FieldType.VariableLengthArray,
                    name,
                    subType: type,
                    options: options,
                });
            }
        };
        this.arrayBuffer = (name, options) => {
            return this.array(name, Array.SubType.ArrayBuffer, options);
        };
        this.string = (name, options) => {
            return this.array(name, Array.SubType.String, options);
        };
        this.options = { ...StructDefaultOptions, ...options };
    }
    get size() { return this._size; }
    clone() {
        const result = new Struct(this.options);
        result.fields = this.fields.slice();
        result._size = this._size;
        result._extra = this._extra;
        result._afterParsed = this._afterParsed;
        return result;
    }
    field(field) {
        const result = this.clone();
        result.fields.push(field);
        const definition = getFieldTypeDefinition(field.type);
        const size = definition.getSize({ field, options: this.options });
        result._size += size;
        return result;
    }
    number(name, type, options = {}, _typescriptType) {
        return this.field({
            type: FieldType.Number,
            name,
            subType: type,
            options,
        });
    }
    uint8(name, options = {}, _typescriptType) {
        return this.number(name, Number$1.SubType.Uint8, options, _typescriptType);
    }
    uint16(name, options = {}, _typescriptType) {
        return this.number(name, Number$1.SubType.Uint16, options, _typescriptType);
    }
    int32(name, options = {}, _typescriptType) {
        return this.number(name, Number$1.SubType.Int32, options, _typescriptType);
    }
    uint32(name, options = {}, _typescriptType) {
        return this.number(name, Number$1.SubType.Uint32, options, _typescriptType);
    }
    uint64(name, options = {}, _typescriptType) {
        return this.number(name, Number$1.SubType.Uint64, options, _typescriptType);
    }
    int64(name, options = {}, _typescriptType) {
        return this.number(name, Number$1.SubType.Int64, options, _typescriptType);
    }
    extra(value) {
        const result = this.clone();
        result._extra = { ...result._extra, ...Object.getOwnPropertyDescriptors(value) };
        return result;
    }
    afterParsed(callback) {
        const result = this.clone();
        result._afterParsed = callback;
        return result;
    }
    initializeField(context, field, fieldTypeDefinition, object, value, extra) {
        if (fieldTypeDefinition.initialize) {
            fieldTypeDefinition.initialize({
                context,
                extra,
                field,
                object,
                options: this.options,
                value,
            });
        }
        else {
            setBackingField(object, field.name, value);
            defineSimpleAccessors(object, field.name);
        }
    }
    create(init, context) {
        const object = {
            [BackingField]: {},
        };
        Object.defineProperties(object, this._extra);
        for (const field of this.fields) {
            const fieldTypeDefinition = getFieldTypeDefinition(field.type);
            this.initializeField(context, field, fieldTypeDefinition, object, init[field.name]);
        }
        return object;
    }
    async deserialize(context) {
        const object = {
            [BackingField]: {},
        };
        Object.defineProperties(object, this._extra);
        for (const field of this.fields) {
            const fieldTypeDefinition = getFieldTypeDefinition(field.type);
            const { value, extra } = await fieldTypeDefinition.deserialize({
                context,
                field,
                object,
                options: this.options,
            });
            this.initializeField(context, field, fieldTypeDefinition, object, value, extra);
        }
        if (this._afterParsed) {
            const result = this._afterParsed.call(object, object);
            if (result) {
                return result;
            }
        }
        return object;
    }
    serialize(init, context) {
        const object = this.create(init, context);
        let size = this._size;
        let fieldSize = [];
        for (let i = 0; i < this.fields.length; i += 1) {
            const field = this.fields[i];
            const type = getFieldTypeDefinition(field.type);
            if (type.getDynamicSize) {
                fieldSize[i] = type.getDynamicSize({
                    context,
                    field,
                    object,
                    options: this.options,
                });
                size += fieldSize[i];
            }
            else {
                fieldSize[i] = type.getSize({ field, options: this.options });
            }
        }
        const buffer = new ArrayBuffer(size);
        const dataView = new DataView(buffer);
        let offset = 0;
        for (let i = 0; i < this.fields.length; i += 1) {
            const field = this.fields[i];
            const type = getFieldTypeDefinition(field.type);
            type.serialize({
                context,
                dataView,
                field,
                object,
                offset,
                options: this.options,
            });
            offset += fieldSize[i];
        }
        return buffer;
    }
}

class BufferedStream {
    constructor(stream) {
        this.stream = stream;
    }
    async read(length) {
        let array;
        let index;
        if (this.buffer) {
            const buffer = this.buffer;
            if (buffer.byteLength > length) {
                this.buffer = buffer.subarray(length);
                return buffer.slice(0, length).buffer;
            }
            array = new Uint8Array(length);
            array.set(buffer);
            index = buffer.byteLength;
            this.buffer = undefined;
        }
        else {
            const buffer = await this.stream.read(length);
            if (buffer.byteLength === length) {
                return buffer;
            }
            if (buffer.byteLength > length) {
                this.buffer = new Uint8Array(buffer, length);
                return buffer.slice(0, length);
            }
            array = new Uint8Array(length);
            array.set(new Uint8Array(buffer), 0);
            index = buffer.byteLength;
        }
        while (index < length) {
            const left = length - index;
            const buffer = await this.stream.read(left);
            if (buffer.byteLength > left) {
                array.set(new Uint8Array(buffer, 0, left), index);
                this.buffer = new Uint8Array(buffer, left);
                return array.buffer;
            }
            array.set(new Uint8Array(buffer), index);
            index += buffer.byteLength;
        }
        return array.buffer;
    }
    close() {
        var _a, _b;
        (_b = (_a = this.stream).close) === null || _b === void 0 ? void 0 : _b.call(_a);
    }
}

const AdbPacketWithoutPayload = new Struct({ littleEndian: true })
    .uint32('command', undefined)
    .uint32('arg0')
    .uint32('arg1')
    .uint32('payloadLength')
    .uint32('checksum')
    .int32('magic');
const AdbPacketStruct = AdbPacketWithoutPayload
    .arrayBuffer('payload', { lengthField: 'payloadLength' })
    .afterParsed((value) => {
    if (value[BackingField].magic !== value.magic) {
        throw new Error('Invalid command');
    }
});
let AdbPacket;
(function (AdbPacket) {
    function create(init, calculateChecksum, backend) {
        let checksum;
        if (calculateChecksum && init.payload) {
            const array = new Uint8Array(init.payload);
            checksum = array.reduce((result, item) => result + item, 0);
        }
        else {
            checksum = 0;
        }
        return AdbPacketStruct.create({
            ...init,
            checksum,
            magic: init.command ^ 0xFFFFFFFF,
        }, backend);
    }
    AdbPacket.create = create;
    async function read(backend) {
        let buffer = await backend.read(24);
        if (buffer.byteLength !== 24) {
            // Maybe it's a payload from last connection.
            // Ignore and try again
            buffer = await backend.read(24);
        }
        let bufferUsed = false;
        const stream = new BufferedStream({
            read(length) {
                if (!bufferUsed) {
                    bufferUsed = true;
                    return buffer;
                }
                return backend.read(length);
            }
        });
        return AdbPacketStruct.deserialize({
            read: stream.read.bind(stream),
            decodeUtf8: backend.decodeUtf8.bind(backend),
            encodeUtf8: backend.encodeUtf8.bind(backend),
        });
    }
    AdbPacket.read = read;
    async function write(packet, backend) {
        // Write payload separately to avoid an extra copy
        await backend.write(AdbPacketWithoutPayload.serialize(packet, backend));
        if (packet.payload) {
            await backend.write(packet.payload);
        }
    }
    AdbPacket.write = write;
})(AdbPacket || (AdbPacket = {}));

const WebUsbDeviceFilter = {
    classCode: 0xFF,
    subclassCode: 0x42,
    protocolCode: 1,
};

const Utf8Encoder = new TextEncoder();
const Utf8Decoder = new TextDecoder();
function encodeUtf8(input) {
    return Utf8Encoder.encode(input);
}
function decodeUtf8(buffer) {
    return Utf8Decoder.decode(buffer);
}

////////////////////////////////////////////////////////
// Dedicated adb and transport function for sideload.  /
////////////////////////////////////////////////////////

class AdbWebBackendSideload {
    constructor(device) {
        this._device = device;
    }

    async connect() {
        var _a;
        if (!this._device.opened) {
            await this._device.open();
        }

        for (const configuration of this._device.configurations) {
            for (const interface_ of configuration.interfaces) {
                for (const alternate of interface_.alternates) {
                    if (alternate.interfaceSubclass === WebUsbDeviceFilter.subclassCode &&
                        alternate.interfaceClass === WebUsbDeviceFilter.classCode &&
                        alternate.interfaceSubclass === WebUsbDeviceFilter.subclassCode) {
                        if (((_a = this._device.configuration) === null || _a === void 0 ? void 0 : _a.configurationValue) !== configuration.configurationValue) {
                            await this._device.selectConfiguration(configuration.configurationValue);
                        }
                        if (!interface_.claimed) {
                            await this._device.claimInterface(interface_.interfaceNumber);
                        }
                        if (interface_.alternate.alternateSetting !== alternate.alternateSetting) {
                            await this._device.selectAlternateInterface(interface_.interfaceNumber, alternate.alternateSetting);
                        }
                        for (const endpoint of alternate.endpoints) {
                            switch (endpoint.direction) {
                                case 'in':
                                    this._inEndpointNumber = endpoint.endpointNumber;
                                    if (this._outEndpointNumber !== undefined) {
                                        return;
                                    }
                                    break;
                                case 'out':
                                    this._outEndpointNumber = endpoint.endpointNumber;
                                    if (this._inEndpointNumber !== undefined) {
                                        return;
                                    }
                                    break;
                            }
                        }
                    }
                }
            }
        }
        throw new Error('Unknown error');
    }

    async write(buffer) {
        await this._device.transferOut(this._outEndpointNumber, buffer);
    }
    async read(length) {
        const result = await this._device.transferIn(this._inEndpointNumber, length);
        if (result.status === 'stall') {
            await this._device.clearHalt('in', this._inEndpointNumber);
        }
        const { buffer } = result.data;
        return buffer;
    }

    encodeUtf8(input) {
        return encodeUtf8(input);
    }
    decodeUtf8(buffer) {
        return decodeUtf8(buffer);
    }

}

export class AdbSideload { 
    // This one is dedicated for adb sidelaod
    constructor(backend) {
        this._connected = false;
        this.backend = new AdbWebBackendSideload(backend);
        this.sendLock = new AutoResetEvent();
        this.initializers = new AsyncOperationManager(1);
    }
    get connected() { return this._connected; }
    async connect() {
        var _a, _b;
        await ((_b = (_a = this.backend).connect) === null || _b === void 0 ? void 0 : _b.call(_a));
        this.calculateChecksum = true;
        this.appendNullToServiceString = true;
        const version = 0x01000001;
        const maxPayloadSize = 0x100000;
  
        await this.sendPacket(AdbCommand.Connect, version, maxPayloadSize, "host::\0");
        const r = await AdbPacket.read(this.backend);
        if (r.command == AdbCommand.Connect) {
            //All is fine
        } else {
            throw new Error('Adb sideload connection error');
        }
    }

    spawn(command, ...args) {
        return this.createStream(`shell:${command} ${args.join(' ')}`);
    }
    exec(command, ...args) {
        return this.createStreamAndReadAll(`shell:${command} ${args.join(' ')}`);
    }
    async getProp(key) {
        const output = await this.exec('getprop', key);
        return output.trim();
    }
    
    async createStream(service) {
        const localId = 1;
        service+='\0';
        let remoteId;
        await this.sendPacket(AdbCommand.Open, localId, 0, service);
        const r = await AdbPacket.read(this.backend);
        if (r.command == AdbCommand.Okay) {
            remoteId = r.arg0;
            return { localId: localId, remoteId:remoteId };
        } else {
            throw new Error('Adb sideload create stream error');
        }
    }

    async dispose() {
        this.packetDispatcher.dispose();
        await this.backend.dispose();
    }
    async sendPacket(packetOrCommand, arg0, arg1, payload) {
        var _a;
        let init;
        if (arguments.length === 1) {
            init = packetOrCommand;
        }
        else {
            init = {
                command: packetOrCommand,
                arg0: arg0,
                arg1: arg1,
                payload: typeof payload === 'string' ? this.backend.encodeUtf8(payload) : payload,
            };
        }
        if (init.payload &&
            init.payload.byteLength > this.maxPayloadSize) {
            throw new Error('payload too large');
        }
        try {
            this.sendLock.wait()
            const packet = AdbPacket.create(init, this.calculateChecksum, this.backend);
            await AdbPacket.write(packet, this.backend);
        }
        catch(e){
            console.log("error send sendPacket ", e);
        }
        finally {
            this.sendLock.notifyOne();
        }
    }
}

////////////////////////////////


