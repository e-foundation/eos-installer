var PromiseResolver = /** @class */ (function () {
    function PromiseResolver() {
        var _this = this;
        this._state = 'running';
        this._promise = new Promise(function (resolve, reject) {
            _this._resolve = resolve;
            _this._reject = reject;
        });
    }
    Object.defineProperty(PromiseResolver.prototype, "promise", {
        get: function () { return this._promise; },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(PromiseResolver.prototype, "state", {
        get: function () { return this._state; },
        enumerable: false,
        configurable: true
    });
    PromiseResolver.prototype.resolve = function (value) {
        this._resolve(value);
        this._state = 'resolved';
    };
    PromiseResolver.prototype.reject = function (reason) {
        this._reject(reason);
        this._state = 'rejected';
    };
    return PromiseResolver;
}());

var AsyncOperationManager = /** @class */ (function () {
    function AsyncOperationManager(initialId) {
        if (initialId === void 0) { initialId = 0; }
        this.operations = new Map();
        this.operationId = initialId;
    }
    AsyncOperationManager.prototype.add = function () {
        var id = this.operationId++;
        var resolver = new PromiseResolver();
        this.operations.set(id, resolver);
        return [id, resolver.promise];
    };
    AsyncOperationManager.prototype.getResolver = function (id) {
        if (!this.operations.has(id)) {
            return null;
        }
        var resolver = this.operations.get(id);
        this.operations.delete(id);
        return resolver;
    };
    AsyncOperationManager.prototype.resolve = function (id, result) {
        var resolver = this.getResolver(id);
        if (resolver !== null) {
            resolver.resolve(result);
            return true;
        }
        return false;
    };
    AsyncOperationManager.prototype.reject = function (id, reason) {
        var resolver = this.getResolver(id);
        if (resolver !== null) {
            resolver.reject(reason);
            return true;
        }
        return false;
    };
    return AsyncOperationManager;
}());

class EventEmitter {
    constructor() {
        this.listeners = [];
        this.event = this.event.bind(this);
    }
    event(listener, thisArg, ...args) {
        const info = {
            listener,
            thisArg,
            args,
        };
        this.listeners.push(info);
        const remove = () => {
            const index = this.listeners.indexOf(info);
            if (index !== -1) {
                this.listeners.splice(index, 1);
            }
        };
        remove.dispose = remove;
        return remove;
    }
    fire(e) {
        for (const info of this.listeners.slice()) {
            info.listener.apply(info.thisArg, [e, ...info.args]);
        }
    }
    dispose() {
        this.listeners.length = 0;
    }
}

class AsyncEventEmitter extends EventEmitter {
    async fire(e) {
        for (const info of this.listeners) {
            await info.listener.apply(info.thisArg, [e, ...info.args]);
        }
    }
}

class AutoDisposable {
    constructor() {
        this.disposables = [];
        this.dispose = this.dispose.bind(this);
    }
    addDisposable(disposable) {
        this.disposables.push(disposable);
        return disposable;
    }
    dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];
    }
}

class DisposableList extends AutoDisposable {
    add(disposable) {
        return this.addDisposable(disposable);
    }
}

const BigInt0 = BigInt(0);
const BigInt1 = BigInt(1);
const BigInt2 = BigInt(2);
const BigInt2To64 = BigInt2 ** BigInt(64);

function getBig(buffer, offset = 0, length = buffer.byteLength - offset) {
    const view = new DataView(buffer);
    let result = BigInt0;
    // Now `length` must be a multiplication of 8
    // Support for arbitrary length can be easily added
    for (let i = offset; i < offset + length; i += 8) {
        result *= BigInt2To64;
        const value = view.getBigUint64(i, false);
        result += value;
    }
    return result;
}

function setBig(buffer, value, offset = 0) {
    const uint64Array = [];
    while (value > BigInt0) {
        uint64Array.push(BigInt.asUintN(64, value));
        value /= BigInt2To64;
    }
    const view = new DataView(buffer);
    for (let i = uint64Array.length - 1; i >= 0; i -= 1) {
        view.setBigUint64(offset, uint64Array[i], false);
        offset += 8;
    }
}

function setBigLE(buffer, value, offset = 0) {
    const view = new DataView(buffer);
    while (value > BigInt0) {
        view.setBigUint64(offset, value, true);
        offset += 8;
        value /= BigInt2To64;
    }
}

// These values are correct only if
// modulus length is 2048 and
// public exponent (e) is 65537
// Anyway, that's how this library generates keys
// To support other parameters,
// a proper ASN.1 parser can be used
// References:
//
//   https://tools.ietf.org/html/rfc8017#appendix-A.1.2
//   PKCS #1: RSA Cryptography Specifications Version 2.2
//     A.1.2.  RSA Private Key Syntax
//
//   https://lapo.it/asn1js/
//   https://github.com/lapo-luchini/asn1js
//   ASN.1 JavaScript decoder
//
//   https://www.itu.int/rec/T-REC-X.690-201508-I/en
//   X.690: Specification of Distinguished Encoding Rules (DER)
const RsaPrivateKeyNOffset = 38;
const RsaPrivateKeyNLength = 2048 / 8;
const RsaPrivateKeyDOffset = 303;
const RsaPrivateKeyDLength = 2048 / 8;

function parsePrivateKey(key) {
    let n = getBig(key, RsaPrivateKeyNOffset, RsaPrivateKeyNLength);
    let d = getBig(key, RsaPrivateKeyDOffset, RsaPrivateKeyDLength);
    return [n, d];
}
// Taken from https://stackoverflow.com/a/51562038
// I can't understand, but it does work
// Only used with numbers less than 2^32 so doesn't need BigInt
function modInverse(a, m) {
    // validate inputs
    [a, m] = [Number(a), Number(m)];
    if (Number.isNaN(a) || Number.isNaN(m)) {
        return NaN; // invalid input
    }
    a = (a % m + m) % m;
    if (!a || m < 2) {
        return NaN; // invalid input
    }
    // find the gcd
    const s = [];
    let b = m;
    while (b) {
        [a, b] = [b, a % b];
        s.push({ a, b });
    }
    if (a !== 1) {
        return NaN; // inverse does not exists
    }
    // find the inverse
    let x = 1;
    let y = 0;
    for (let i = s.length - 2; i >= 0; --i) {
        [x, y] = [y, x - y * Math.floor(s[i].a / s[i].b)];
    }
    return (y % m + m) % m;
}
function calculatePublicKeyLength() {
    return 4 + 4 + 2048 / 8 + 2048 / 8 + 4;
}
function calculatePublicKey(privateKey, output, outputOffset = 0) {
    // Android has its own public key generation algorithm
    // See https://android.googlesource.com/platform/system/core.git/+/91784040db2b9273687f88d8b95f729d4a61ecc2/libcrypto_utils/android_pubkey.cpp#111
    // The public key is an array of
    //
    // [
    //   modulusLengthInWords, // 32-bit integer, a "word" is 32-bit so it must be 2048 / 8 / 4
    //                         // Actually the comment in Android source code was wrong
    //   n0inv,                // 32-bit integer, the modular inverse of (lower 32 bits of) n
    //   modulus,              // n
    //   rr,                   // Montgomery parameter R^2
    //   exponent,             // 32-bit integer, must be 65537
    // ]
    //
    // (All in little endian)
    // See https://android.googlesource.com/platform/system/core.git/+/91784040db2b9273687f88d8b95f729d4a61ecc2/libcrypto_utils/android_pubkey.cpp#38
    // extract `n` from private key
    const [n] = parsePrivateKey(privateKey);
    let outputType;
    const outputLength = calculatePublicKeyLength();
    if (!output) {
        output = new ArrayBuffer(outputLength);
        outputType = 'ArrayBuffer';
    }
    else {
        if (output.byteLength - outputOffset < outputLength) {
            throw new Error('output buffer is too small');
        }
        outputType = 'number';
    }
    const outputView = new DataView(output);
    // modulusLengthInWords
    outputView.setUint32(outputOffset, 2048 / 8 / 4, true);
    outputOffset += 4;
    // Calculate `n0inv`
    // Don't know why need to multiple -1
    // Didn't exist in Android codebase
    const n0inv = modInverse(Number(BigInt.asUintN(32, n) * BigInt(-1)), 2 ** 32);
    outputView.setUint32(outputOffset, n0inv, true);
    outputOffset += 4;
    // Write n
    setBigLE(output, n, outputOffset);
    outputOffset += 256;
    // Calculate rr = (2^(rsa_size)) ^ 2 mod n
    let rr = BigInt(2) ** BigInt(4096) % n;
    setBigLE(output, rr, outputOffset);
    outputOffset += 256;
    // exponent
    outputView.setUint32(outputOffset, 65537, true);
    outputOffset += 4;
    if (outputType === 'ArrayBuffer') {
        return output;
    }
    else {
        return outputLength;
    }
}
// Modular exponentiation
// See https://en.wikipedia.org/wiki/Modular_exponentiation#Implementation_in_Lua
function powMod(base, exponent, modulus) {
    if (modulus === BigInt1) {
        return BigInt0;
    }
    let r = BigInt1;
    base = base % modulus;
    while (exponent > BigInt0) {
        if (BigInt.asUintN(1, exponent) === BigInt1) {
            r = r * base % modulus;
        }
        exponent >>= BigInt1;
        base = base ** BigInt2 % modulus;
    }
    return r;
}
const Sha1DigestLength = 20;
const Asn1Sequence = 0x30;
const Asn1OctetString = 0x04;
const Asn1Null = 0x05;
const Asn1Oid = 0x06;
// PKCS#1 SHA-1 hash digest info
const Sha1DigestInfo = [
    Asn1Sequence, 0x0d + Sha1DigestLength,
    Asn1Sequence, 0x09,
    // SHA-1 (1 3 14 3 2 26)
    Asn1Oid, 0x05, 1 * 40 + 3, 14, 3, 2, 26,
    Asn1Null, 0x00,
    Asn1OctetString, Sha1DigestLength
];
// SubtleCrypto.sign() will hash the given data and sign the hash
// But we don't need the hashing step
// (In another word, ADB just requires the client to
// encrypt the given data with its private key)
// However SubtileCrypto.encrypt() doesn't accept 'RSASSA-PKCS1-v1_5' algorithm
// So we need to implement the encryption by ourself
function sign(privateKey, data) {
    const [n, d] = parsePrivateKey(privateKey);
    // PKCS#1 padding
    const padded = new Uint8Array(256);
    let index = 0;
    padded[index] = 0;
    index += 1;
    padded[index] = 1;
    index += 1;
    const fillLength = padded.length - Sha1DigestInfo.length - data.byteLength - 1;
    while (index < fillLength) {
        padded[index] = 0xff;
        index += 1;
    }
    padded[index] = 0;
    index += 1;
    padded.set(new Uint8Array(Sha1DigestInfo), index);
    index += Sha1DigestInfo.length;
    padded.set(new Uint8Array(data), index);
    // Encryption
    // signature = padded ** d % n
    let signature = powMod(getBig(padded.buffer), d, n);
    // Put into an ArrayBuffer
    const result = new ArrayBuffer(256);
    setBig(result, signature);
    return result;
}

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

class AutoResetEvent {
    constructor(initialSet = false) {
        this.list = [];
        this.blocking = initialSet;
    }
    wait() {
        if (!this.blocking) {
            this.blocking = true;
            if (this.list.length === 0) {
                return Promise.resolve();
            }
        }
        const resolver = new PromiseResolver();
        this.list.push(resolver);
        return resolver.promise;
    }
    notify() {
        if (this.list.length !== 0) {
            this.list.pop().resolve();
        }
        else {
            this.blocking = false;
        }
    }
    dispose() {
        for (const item of this.list) {
            item.reject(new Error('The AutoResetEvent has been disposed'));
        }
        this.list.length = 0;
    }
}

// Prepare maps for O(1) searching
const charToIndex = {};
const indexToChar = [];
const paddingChar = '='.charCodeAt(0);
function addRange(start, end) {
    const charCodeStart = start.charCodeAt(0);
    const charCodeEnd = end.charCodeAt(0);
    for (let charCode = charCodeStart; charCode <= charCodeEnd; charCode += 1) {
        charToIndex[String.fromCharCode(charCode)] = indexToChar.length;
        indexToChar.push(charCode);
    }
}
addRange('A', 'Z');
addRange('a', 'z');
addRange('0', '9');
addRange('+', '+');
addRange('/', '/');

function calculateBase64EncodedLength(inputLength) {
    const remainder = inputLength % 3;
    const paddingLength = remainder !== 0 ? 3 - remainder : 0;
    return [(inputLength + paddingLength) / 3 * 4, paddingLength];
}
function encodeBase64(input, arg1, arg2, _arg3, _arg4) {
    var _a;
    if (input instanceof ArrayBuffer) {
        input = new Uint8Array(input);
    }
    // Because `Uint8Array` is type compatible with `ArrayBuffer`,
    // TypeScript doesn't correctly narrow `input` to `Uint8Array` when assigning.
    // Manually eliminate `ArrayBuffer` from `input` with a type guard.
    if (input instanceof ArrayBuffer) {
        return input;
    }
    let inputOffset;
    let inputLength;
    let output;
    let outputOffset;
    let outputArgumentIndex;
    if (typeof arg1 === 'number') {
        // overload 1, 3, 4
        inputOffset = arg1;
        if (typeof arg2 === 'number') {
            // overload 1, 4
            inputLength = arg2;
            outputArgumentIndex = 3;
        }
        else {
            // overload 3
            inputLength = input.byteLength - inputOffset;
            outputArgumentIndex = 2;
        }
    }
    else {
        // overload 2
        inputOffset = 0;
        inputLength = input.byteLength;
        outputArgumentIndex = 1;
    }
    const [outputLength, paddingLength] = calculateBase64EncodedLength(inputLength);
    let maybeOutput = arguments[outputArgumentIndex];
    let outputType;
    if (maybeOutput) {
        outputOffset = (_a = arguments[outputArgumentIndex + 1]) !== null && _a !== void 0 ? _a : 0;
        if (maybeOutput.byteLength - outputOffset < outputLength) {
            throw new Error('output buffer is too small');
        }
        if (maybeOutput instanceof ArrayBuffer) {
            output = new Uint8Array(maybeOutput);
        }
        else {
            output = maybeOutput;
        }
        outputType = 'number';
    }
    else {
        const buffer = new ArrayBuffer(outputLength);
        output = new Uint8Array(buffer);
        outputOffset = 0;
        outputType = 'ArrayBuffer';
    }
    // Because `Uint8Array` is type compatible with `ArrayBuffer`,
    // TypeScript doesn't correctly narrow `output` to `Uint8Array` when assigning.
    // Manually eliminate `ArrayBuffer` from `output` with a type guard.
    if (output instanceof ArrayBuffer) {
        return output;
    }
    if (input.buffer === output.buffer) {
        const bufferInputStart = input.byteOffset + inputOffset;
        const bufferOutputStart = output.byteOffset + outputOffset;
        if (bufferOutputStart < bufferInputStart - 1) {
            const bufferOutputEnd = bufferOutputStart + outputLength;
            if (bufferOutputEnd >= bufferInputStart) {
                throw new Error('input and output buffer can not be overlapping');
            }
        }
    }
    // Run backward to do in-place overwrite
    let inputIndex = inputOffset + inputLength - 1;
    let outputIndex = outputOffset + outputLength - 1;
    if (paddingLength === 2) {
        // aaaaaabb
        const x = input[inputIndex];
        inputIndex -= 1;
        output[outputIndex] = paddingChar;
        outputIndex -= 1;
        output[outputIndex] = paddingChar;
        outputIndex -= 1;
        output[outputIndex] = indexToChar[((x & 0b11) << 4)];
        outputIndex -= 1;
        output[outputIndex] = indexToChar[x >> 2];
        outputIndex -= 1;
    }
    else if (paddingLength === 1) {
        // bbbbcccc
        const y = input[inputIndex];
        inputIndex -= 1;
        // aaaaaabb
        const x = input[inputIndex];
        inputIndex -= 1;
        output[outputIndex] = paddingChar;
        outputIndex -= 1;
        output[outputIndex] = indexToChar[((y & 0b1111) << 2)];
        outputIndex -= 1;
        output[outputIndex] = indexToChar[((x & 0b11) << 4) | (y >> 4)];
        outputIndex -= 1;
        output[outputIndex] = indexToChar[x >> 2];
        outputIndex -= 1;
    }
    while (inputIndex >= inputOffset) {
        // ccdddddd
        const z = input[inputIndex];
        inputIndex -= 1;
        // bbbbcccc
        const y = input[inputIndex];
        inputIndex -= 1;
        // aaaaaabb
        const x = input[inputIndex];
        inputIndex -= 1;
        output[outputIndex] = indexToChar[z & 0b111111];
        outputIndex -= 1;
        output[outputIndex] = indexToChar[((y & 0b1111) << 2) | (z >> 6)];
        outputIndex -= 1;
        output[outputIndex] = indexToChar[((x & 0b11) << 4) | (y >> 4)];
        outputIndex -= 1;
        output[outputIndex] = indexToChar[x >> 2];
        outputIndex -= 1;
    }
    if (outputType === 'ArrayBuffer') {
        return output.buffer;
    }
    else {
        return outputLength;
    }
}

function decodeBase64(input) {
    let padding;
    if (input[input.length - 2] === '=') {
        padding = 2;
    }
    else if (input[input.length - 1] === '=') {
        padding = 1;
    }
    else {
        padding = 0;
    }
    const result = new Uint8Array(input.length / 4 * 3 - padding);
    let sIndex = 0;
    let dIndex = 0;
    while (sIndex < input.length - (padding !== 0 ? 4 : 0)) {
        const a = charToIndex[input[sIndex]];
        sIndex += 1;
        const b = charToIndex[input[sIndex]];
        sIndex += 1;
        const c = charToIndex[input[sIndex]];
        sIndex += 1;
        const d = charToIndex[input[sIndex]];
        sIndex += 1;
        result[dIndex] = (a << 2) | ((b & 48) >> 4);
        dIndex += 1;
        result[dIndex] = ((b & 0b1111) << 4) | ((c & 60) >> 2);
        dIndex += 1;
        result[dIndex] = ((c & 0b11) << 6) | d;
        dIndex += 1;
    }
    if (padding === 1) {
        const a = charToIndex[input[sIndex]];
        sIndex += 1;
        const b = charToIndex[input[sIndex]];
        sIndex += 1;
        const c = charToIndex[input[sIndex]];
        result[dIndex] = (a << 2) | ((b & 48) >> 4);
        dIndex += 1;
        result[dIndex] = ((b & 0b1111) << 4) | ((c & 60) >> 2);
    }
    else if (padding === 2) {
        const a = charToIndex[input[sIndex]];
        sIndex += 1;
        const b = charToIndex[input[sIndex]];
        result[dIndex] = (a << 2) | ((b & 48) >> 4);
    }

    return result.buffer;
}

const EventQueueDefaultOptions = {
    maxWaitCount: Infinity,
    highWaterMark: 10,
    lowWaterMark: 0,
};
class EventQueue {
    constructor(options = EventQueueDefaultOptions) {
        this.pullQueue = [];
        this.pushQueue = [];
        this.ended = false;
        this.waterMark = 0;
        this.pendingLowWaterEvent = false;
        this.lowWaterEvent = new EventEmitter();
        this.options = { ...EventQueueDefaultOptions, ...options };
    }
    get onLowWater() { return this.lowWaterEvent.event; }
    push(value, size = 1) {
        if (this.ended) {
            return true;
        }
        if (this.pullQueue.length) {
            this.pullQueue.shift().resolve(value);
            return true;
        }
        this.pushQueue.push([value, size]);
        this.waterMark += size;
        if (this.waterMark < this.options.highWaterMark) {
            return true;
        }
        this.pendingLowWaterEvent = true;
        return false;
    }
    next() {
        if (this.pushQueue.length) {
            const [value, size] = this.pushQueue.shift();
            this.waterMark -= size;
            if (this.pendingLowWaterEvent &&
                this.waterMark <= this.options.lowWaterMark) {
                this.lowWaterEvent.fire();
            }
            return Promise.resolve(value);
        }
        if (this.ended) {
            return Promise.reject(new Error('The EventQueue has already ended'));
        }
        if (this.pullQueue.length === this.options.maxWaitCount - 1) {
            throw new Error('Max wait count exceeded');
        }
        const resolver = new PromiseResolver();
        this.pullQueue.push(resolver);
        return resolver.promise;
    }
    end() {
        this.ended = true;
        let item;
        while (item = this.pullQueue.shift()) {
            item.reject(new Error('The EventQueue has already ended'));
        }
    }
}

class AdbReadableStream {
    constructor(stream) {
        this.readLock = new AutoResetEvent();
        this.stream = stream;
        this.queue = new EventQueue({
            highWaterMark: 16 * 1024,
        });
        const resetEvent = new AutoResetEvent(true);
        this.stream.onData(buffer => {
            if (!this.queue.push(buffer, buffer.byteLength)) {
                return resetEvent.wait();
            }
            return;
        });
        this.stream.onClose(() => {
            this.queue.end();
        });
        this.queue.onLowWater(() => {
            resetEvent.notify();
        });
    }
    get backend() { return this.stream.backend; }
    get localId() { return this.stream.localId; }
    get remoteId() { return this.stream.remoteId; }
    async read() {
        await this.readLock.wait();
        try {
            return await this.queue.next();
        }
        finally {
            this.readLock.notify();
        }
    }
    write(data) {
        return this.stream.write(data);
    }
    close() {
        this.stream.close();
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
class AdbBufferedStream extends BufferedStream {
    get backend() { return this.stream.backend; }
    get localId() { return this.stream.localId; }
    get remoteId() { return this.stream.remoteId; }
    constructor(stream) {
        super(new AdbReadableStream(stream));
    }
    write(data) {
        return this.stream.write(data);
    }
    decodeUtf8(buffer) {
        return this.backend.decodeUtf8(buffer);
    }
    encodeUtf8(input) {
        return this.backend.encodeUtf8(input);
    }
}

function* chunkArrayLike(value, size) {
    if ('length' in value) {
        value = new Uint8Array(value).buffer;
    }
    if (value.byteLength <= size) {
        return yield value;
    }
    for (let i = 0; i < value.byteLength; i += size) {
        yield value.slice(i, i + size);
    }
}

class AdbStreamController extends AutoDisposable {
    constructor(localId, remoteId, dispatcher) {
        super();
        this.writeChunkLock = this.addDisposable(new AutoResetEvent());
        this.writeLock = this.addDisposable(new AutoResetEvent());
        this.dataEvent = this.addDisposable(new AsyncEventEmitter());
        this._closed = false;
        this.closeEvent = this.addDisposable(new EventEmitter());
        this.localId = localId;
        this.remoteId = remoteId;
        this.dispatcher = dispatcher;
    }
    get backend() { return this.dispatcher.backend; }
    get closed() { return this._closed; }
    get onClose() { return this.closeEvent.event; }
    async writeChunk(data) {
        if (this._closed) {
            throw new Error('Can not write after closed');
        }
        // Wait for an ack packet
        await this.writeChunkLock.wait();
        await this.dispatcher.sendPacket(AdbCommand.Write, this.localId, this.remoteId, data);
    }
    async write(data) {
        // Keep write operations in order
        await this.writeLock.wait();
        for await (const chunk of chunkArrayLike(data, this.dispatcher.maxPayloadSize)) {
            await this.writeChunk(chunk);
        }
        this.writeLock.notify();
    }
    ack() {
        this.writeChunkLock.notify();
    }
    async close() {
        if (!this._closed) {
            await this.dispatcher.sendPacket(AdbCommand.Close, this.localId, this.remoteId);
            this._closed = true;
        }
    }
    dispose() {
        this._closed = true;
        this.closeEvent.fire();
        super.dispose();
    }
}

class AdbStream {
    constructor(controller) {
        this.controller = controller;
    }
    get backend() { return this.controller.backend; }
    get localId() { return this.controller.localId; }
    get remoteId() { return this.controller.remoteId; }
    get closed() { return this.controller.closed; }
    get onData() { return this.controller.dataEvent.event; }
    get onClose() { return this.controller.onClose; }
    write(data) {
        return this.controller.write(data);
    }
    close() {
        return this.controller.close();
    }
}

class AdbPacketDispatcher extends AutoDisposable {
    constructor(backend, logger) {
        super();
        // ADB stream id starts from 1
        // (0 means open failed)
        this.initializers = new AsyncOperationManager(1);
        this.streams = new Map();
        this.sendLock = new AutoResetEvent();
        this.maxPayloadSize = 0;
        this.calculateChecksum = true;
        this.appendNullToServiceString = true;
        this.packetEvent = this.addDisposable(new EventEmitter());
        this.streamEvent = this.addDisposable(new EventEmitter());
        this.errorEvent = this.addDisposable(new EventEmitter());
        this._running = false;
        this.backend = backend;
        this.logger = logger;
    }
    get onPacket() { return this.packetEvent.event; }
    get onStream() { return this.streamEvent.event; }
    get onError() { return this.errorEvent.event; }
    get running() { return this._running; }
    async receiveLoop() {
        var _a;
        try {
            while (this._running) {
                const packet = await AdbPacket.read(this.backend);
                (_a = this.logger) === null || _a === void 0 ? void 0 : _a.onIncomingPacket(packet);
                switch (packet.command) {
                    case AdbCommand.OK:
                        this.handleOk(packet);
                        continue;
                    case AdbCommand.Close:
                        // CLSE also has two meanings
                        if (packet.arg0 === 0) {
                            // 1. The device don't want to create the Stream
                            this.initializers.reject(packet.arg1, new Error('Stream open failed'));
                            continue;
                        }
                        if (this.streams.has(packet.arg1)) {
                            // 2. The device has closed the Stream
                            this.streams.get(packet.arg1).dispose();
                            this.streams.delete(packet.arg1);
                            continue;
                        }
                        // Maybe the device is responding to a packet of last connection
                        // Just ignore it
                        continue;
                    case AdbCommand.Write:
                        if (this.streams.has(packet.arg1)) {
                            await this.streams.get(packet.arg1).dataEvent.fire(packet.payload);
                            await this.sendPacket(AdbCommand.OK, packet.arg1, packet.arg0);
                        }
                        // Maybe the device is responding to a packet of last connection
                        // Just ignore it
                        continue;
                    case AdbCommand.Open:
                        await this.handleOpen(packet);
                        continue;
                }
                const args = {
                    handled: false,
                    packet,
                };
                this.packetEvent.fire(args);
                if (!args.handled) {
                    this.dispose();
                    throw new Error(`Unhandled packet with command '${packet.command}'`);
                }
            }
        }
        catch (e) {
            if (!this._running) {
                // ignore error
                return;
            }
            this.errorEvent.fire(e);
        }
    }
    handleOk(packet) {
        if (this.initializers.resolve(packet.arg1, packet.arg0)) {
            // Device has created the `Stream`
            return;
        }
        if (this.streams.has(packet.arg1)) {
            // Device has received last `WRTE` to the `Stream`
            this.streams.get(packet.arg1).ack();
            return;
        }
        // Maybe the device is responding to a packet of last connection
        // Tell the device to close the stream
        this.sendPacket(AdbCommand.Close, packet.arg1, packet.arg0);
    }
    async handleOpen(packet) {
        // AsyncOperationManager doesn't support get and skip an ID
        // Use `add` + `resolve` to simulate this behavior
        const [localId] = this.initializers.add();
        this.initializers.resolve(localId, undefined);
        const remoteId = packet.arg0;
        const controller = new AdbStreamController(localId, remoteId, this);
        const stream = new AdbStream(controller);
        const args = {
            handled: false,
            packet,
            stream,
        };
        this.streamEvent.fire(args);
        if (args.handled) {
            this.streams.set(localId, controller);
            await this.sendPacket(AdbCommand.OK, localId, remoteId);
        }
        else {
            await this.sendPacket(AdbCommand.Close, 0, remoteId);
        }
    }
    start() {
        this._running = true;
        this.receiveLoop();
    }

    async createStream(service) {
        if (this.appendNullToServiceString) {
            service += '\0';
        }
        const [localId, initializer] = this.initializers.add();
        await this.sendPacket(AdbCommand.Open, localId, 0, service);
        const remoteId = await initializer;
        const controller = new AdbStreamController(localId, remoteId, this);
        this.streams.set(controller.localId, controller);
        return new AdbStream(controller);
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
            // `AdbPacke t.write` writes each packet in two parts
            // Use a lock to prevent packets been interlaced
            await this.sendLock.wait();
            const packet = AdbPacket.create(init, this.calculateChecksum, this.backend);
            (_a = this.logger) === null || _a === void 0 ? void 0 : _a.onOutgoingPacket(packet);
            await AdbPacket.write(packet, this.backend);
        }
        finally {
            this.sendLock.notify();
        }
    }
    dispose() {
        this._running = false;
        for (const stream of this.streams.values()) {
            stream.dispose();
        }
        this.streams.clear();
        super.dispose();
    }
}

var AdbCommand;
(function (AdbCommand) {
    AdbCommand[AdbCommand["Auth"] = 1213486401] = "Auth";
    AdbCommand[AdbCommand["Close"] = 1163086915] = "Close";
    AdbCommand[AdbCommand["Connect"] = 1314410051] = "Connect"; // CNXN
    AdbCommand[AdbCommand["OK"] = 1497451343] = "OK";
    AdbCommand[AdbCommand["Open"] = 1313165391] = "Open";
    AdbCommand[AdbCommand["Write"] = 1163154007] = "Write";
})(AdbCommand || (AdbCommand = {}));
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
var AdbPacket;
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

var AdbAuthType;
(function (AdbAuthType) {
    AdbAuthType[AdbAuthType["Token"] = 1] = "Token";
    AdbAuthType[AdbAuthType["Signature"] = 2] = "Signature";
    AdbAuthType[AdbAuthType["PublicKey"] = 3] = "PublicKey";
})(AdbAuthType || (AdbAuthType = {}));
const AdbSignatureAuthenticator = async function* (backend, getNextRequest) {
    for await (const key of backend.iterateKeys()) {
        const packet = await getNextRequest();
        if (packet.arg0 !== AdbAuthType.Token) {
            return;
        }
        const signature = sign(key, packet.payload);
        yield {
            command: AdbCommand.Auth,
            arg0: AdbAuthType.Signature,
            arg1: 0,
            payload: signature,
        };
    }
};
const AdbPublicKeyAuthenticator = async function* (backend, getNextRequest) {
    const packet = await getNextRequest();
    if (packet.arg0 !== AdbAuthType.Token) {
        return;
    }
    let privateKey;
    for await (const key of backend.iterateKeys()) {
        privateKey = key;
        break;
    }
    if (!privateKey) {
        privateKey = await backend.generateKey();
    }
    const publicKeyLength = calculatePublicKeyLength();
    const [publicKeyBase64Length] = calculateBase64EncodedLength(publicKeyLength);
    // The public key is null terminated,
    // So we allocate the buffer with one extra byte.
    const publicKeyBuffer = new ArrayBuffer(publicKeyBase64Length + 1);
    calculatePublicKey(privateKey, publicKeyBuffer);
    encodeBase64(publicKeyBuffer, 0, publicKeyLength, publicKeyBuffer);
    yield {
        command: AdbCommand.Auth,
        arg0: AdbAuthType.PublicKey,
        arg1: 0,
        payload: publicKeyBuffer
    };
};
const AdbDefaultAuthenticators = [
    AdbSignatureAuthenticator,
    AdbPublicKeyAuthenticator
];
class AdbAuthenticationHandler {
    constructor(authenticators, backend) {
        this.pendingRequest = new PromiseResolver();
        this.getNextRequest = () => {
            return this.pendingRequest.promise;
        };
        this.authenticators = authenticators;
        this.backend = backend;
    }
    async *runAuthenticator() {
        for (const authenticator of this.authenticators) {
            for await (const packet of authenticator(this.backend, this.getNextRequest)) {
                // If the authenticator yielded a response
                // Prepare `nextRequest` for next authentication request
                this.pendingRequest = new PromiseResolver();
                // Yield the response to outer layer
                yield packet;
            }
            // If the authenticator returned,
            // Next authenticator will be given the same `pendingRequest`
        }
        throw new Error('Cannot authenticate with device');
    }
    async handle(packet) {
        if (!this.iterator) {
            this.iterator = this.runAuthenticator();
        }
        this.pendingRequest.resolve(packet);
        const result = await this.iterator.next();
        return result.value;
    }
    dispose() {
        var _a, _b;
        (_b = (_a = this.iterator) === null || _a === void 0 ? void 0 : _a.return) === null || _b === void 0 ? void 0 : _b.call(_a);
    }
}

class AdbCommandBase extends AutoDisposable {
    constructor(adb) {
        super();
        this.adb = adb;
    }
}

const Version = new Struct({ littleEndian: true }).uint32('version');
/*
 * ADB uses 8 int32 fields to describe bit depths
 * The only combination I have seen is RGBA8888, which is
 *   red_offset:   0
 *   red_length:   8
 *   blue_offset:  16
 *   blue_length:  8
 *   green_offset: 8
 *   green_length: 8
 *   alpha_offset: 24
 *   alpha_length: 8
 */
const AdbFrameBufferV1 = new Struct({ littleEndian: true })
    .uint32('bpp')
    .uint32('size')
    .uint32('width')
    .uint32('height')
    .uint32('red_offset')
    .uint32('red_length')
    .uint32('blue_offset')
    .uint32('blue_length')
    .uint32('green_offset')
    .uint32('green_length')
    .uint32('alpha_offset')
    .uint32('alpha_length')
    .arrayBuffer('data', { lengthField: 'size' });
const AdbFrameBufferV2 = new Struct({ littleEndian: true })
    .uint32('bpp')
    .uint32('colorSpace')
    .uint32('size')
    .uint32('width')
    .uint32('height')
    .uint32('red_offset')
    .uint32('red_length')
    .uint32('blue_offset')
    .uint32('blue_length')
    .uint32('green_offset')
    .uint32('green_length')
    .uint32('alpha_offset')
    .uint32('alpha_length')
    .arrayBuffer('data', { lengthField: 'size' });
async function framebuffer(adb) {
    const stream = await adb.createStream('framebuffer:');
    const buffered = new AdbBufferedStream(stream);
    const { version } = await Version.deserialize(buffered);
    switch (version) {
        case 1:
            return AdbFrameBufferV1.deserialize(buffered);
        case 2:
            return AdbFrameBufferV2.deserialize(buffered);
        default:
            throw new Error('Unknown FrameBuffer version');
    }
}

function escapeArg(s) {
    let result = '';
    result += `'`;
    let base = 0;
    while (true) {
        const found = s.indexOf(`'`, base);
        if (found === -1) {
            result += s.substring(base);
            break;
        }
        result += s.substring(base, found);
        // a'b become a'\'b
        result += String.raw `'\''`;
        base = found + 1;
    }
    result += `'`;
    return result;
}

async function install(adb, apk, onProgress) {
    const filename = `/data/local/tmp/${Math.random().toString().substr(2)}.apk`;
    // Upload apk file to tmp folder
    const sync = await adb.sync();
    await sync.write(filename, apk, undefined, undefined, onProgress);
    sync.dispose();
    // Invoke `pm install` to install it
    await adb.exec('pm', 'install', escapeArg(filename));
    // Remove the temp file
    await adb.rm(filename);
}

const AdbReverseStringResponse = new Struct({ littleEndian: true })
    .string('length', { length: 4 })
    .string('content', { lengthField: 'length' });
const AdbReverseErrorResponse = AdbReverseStringResponse
    .afterParsed((value) => {
    throw new Error(value.content);
});
class AdbReverseCommand extends AutoDisposable {
    constructor(dispatcher) {
        super();
        this.localPortToHandler = new Map();
        this.deviceAddressToLocalPort = new Map();
        this.listening = false;
        this.dispatcher = dispatcher;
        this.addDisposable(this.dispatcher.onStream(this.handleStream, this));
    }
    async createBufferedStream(service) {
        const stream = await this.dispatcher.createStream(service);
        return new AdbBufferedStream(stream);
    }
    async sendRequest(service) {
        const stream = await this.createBufferedStream(service);
        const success = this.dispatcher.backend.decodeUtf8(await stream.read(4)) === 'OKAY';
        if (!success) {
            await AdbReverseErrorResponse.deserialize(stream);
        }
        return stream;
    }
    handleStream(e) {
        if (e.handled) {
            return;
        }
        const address = this.dispatcher.backend.decodeUtf8(e.packet.payload);
        // tcp:1234\0
        const port = Number.parseInt(address.substring(4));
        if (this.localPortToHandler.has(port)) {
            this.localPortToHandler.get(port).onStream(e.packet, e.stream);
            e.handled = true;
        }
    }
    async list() {
        const stream = await this.createBufferedStream('reverse:list-forward');
        const response = await AdbReverseStringResponse.deserialize(stream);
        return response.content.split('\n').map(line => {
            const [deviceSerial, localName, remoteName] = line.split(' ');
            return { deviceSerial, localName, remoteName };
        });
        // No need to close the stream, device will close it
    }
    async add(deviceAddress, localPort, handler) {
        const stream = await this.sendRequest(`reverse:forward:${deviceAddress};tcp:${localPort}`);
        // `tcp:0` tells the device to pick an available port.
        // However, device will response with the selected port for all `tcp:` requests.
        if (deviceAddress.startsWith('tcp:')) {
            const response = await AdbReverseStringResponse.deserialize(stream);
            deviceAddress = `tcp:${Number.parseInt(response.content, 10)}`;
        }
        this.localPortToHandler.set(localPort, handler);
        this.deviceAddressToLocalPort.set(deviceAddress, localPort);
        return deviceAddress;
        // No need to close the stream, device will close it
    }
    async remove(deviceAddress) {
        await this.sendRequest(`reverse:killforward:${deviceAddress}`);
        if (this.deviceAddressToLocalPort.has(deviceAddress)) {
            this.localPortToHandler.delete(this.deviceAddressToLocalPort.get(deviceAddress));
            this.deviceAddressToLocalPort.delete(deviceAddress);
        }
        // No need to close the stream, device will close it
    }
    async removeAll() {
        await this.sendRequest(`reverse:killforward-all`);
        this.deviceAddressToLocalPort.clear();
        this.localPortToHandler.clear();
        // No need to close the stream, device will close it
    }
}

var AdbSyncRequestId;
(function (AdbSyncRequestId) {
    AdbSyncRequestId["List"] = "LIST";
    AdbSyncRequestId["Send"] = "SEND";
    AdbSyncRequestId["Lstat"] = "STAT";
    AdbSyncRequestId["Stat"] = "STA2";
    AdbSyncRequestId["Lstat2"] = "LST2";
    AdbSyncRequestId["Data"] = "DATA";
    AdbSyncRequestId["Done"] = "DONE";
    AdbSyncRequestId["Receive"] = "RECV";
})(AdbSyncRequestId || (AdbSyncRequestId = {}));
const AdbSyncNumberRequest = new Struct({ littleEndian: true })
    .string('id', { length: 4 })
    .uint32('arg');
const AdbSyncDataRequest = AdbSyncNumberRequest
    .arrayBuffer('data', { lengthField: 'arg' });
async function adbSyncWriteRequest(stream, id, value) {
    let buffer;
    if (typeof value === 'number') {
        buffer = AdbSyncNumberRequest.serialize({
            id,
            arg: value,
        }, stream);
    }
    else if (typeof value === 'string') {
        buffer = AdbSyncDataRequest.serialize({
            id,
            data: stream.encodeUtf8(value),
        }, stream);
    }
    else {
        buffer = AdbSyncDataRequest.serialize({
            id,
            data: value,
        }, stream);
    }
    await stream.write(buffer);
}

var AdbSyncResponseId;
(function (AdbSyncResponseId) {
    AdbSyncResponseId["Entry"] = "DENT";
    AdbSyncResponseId["Lstat"] = "STAT";
    AdbSyncResponseId["Stat"] = "STA2";
    AdbSyncResponseId["Lstat2"] = "LST2";
    AdbSyncResponseId["Done"] = "DONE";
    AdbSyncResponseId["Data"] = "DATA";
    AdbSyncResponseId["Ok"] = "OKAY";
    AdbSyncResponseId["Fail"] = "FAIL";
})(AdbSyncResponseId || (AdbSyncResponseId = {}));
// DONE responses' size are always same as the request's normal response.
// For example DONE responses for LIST requests are 16 bytes (same as DENT responses),
// but DONE responses for STAT requests are 12 bytes (same as STAT responses)
// So we need to know responses' size in advance.
class AdbSyncDoneResponse {
    constructor(length) {
        this.id = AdbSyncResponseId.Done;
        this.length = length;
    }
    async deserialize(context) {
        await context.read(this.length);
        return this;
    }
}
const AdbSyncFailResponse = new Struct({ littleEndian: true })
    .uint32('messageLength')
    .string('message', { lengthField: 'messageLength' })
    .afterParsed(object => {
    throw new Error(object.message);
});
async function adbSyncReadResponse(stream, types) {
    const id = stream.backend.decodeUtf8(await stream.read(4));
    if (id === AdbSyncResponseId.Fail) {
        await AdbSyncFailResponse.deserialize(stream);
    }
    if (types[id]) {
        return types[id].deserialize(stream);
    }
    throw new Error('Unexpected response id');
}

// https://github.com/python/cpython/blob/4e581d64b8aff3e2eda99b12f080c877bb78dfca/Lib/stat.py#L36
var LinuxFileType;
(function (LinuxFileType) {
    LinuxFileType[LinuxFileType["Directory"] = 4] = "Directory";
    LinuxFileType[LinuxFileType["File"] = 8] = "File";
    LinuxFileType[LinuxFileType["Link"] = 10] = "Link";
})(LinuxFileType || (LinuxFileType = {}));
const AdbSyncLstatResponse = new Struct({ littleEndian: true })
    .int32('mode')
    .int32('size')
    .int32('mtime')
    .extra({
    id: AdbSyncResponseId.Lstat,
    get type() { return this.mode >> 12; },
    get permission() { return this.mode & 4095; },
})
    .afterParsed((object) => {
    if (object.mode === 0 &&
        object.size === 0 &&
        object.mtime === 0) {
        throw new Error('lstat failed');
    }
});
var AdbSyncStatErrorCode;
(function (AdbSyncStatErrorCode) {
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["EACCES"] = 13] = "EACCES";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["EEXIST"] = 17] = "EEXIST";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["EFAULT"] = 14] = "EFAULT";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["EFBIG"] = 27] = "EFBIG";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["EINTR"] = 4] = "EINTR";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["EINVAL"] = 22] = "EINVAL";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["EIO"] = 5] = "EIO";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["EISDIR"] = 21] = "EISDIR";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["ELOOP"] = 40] = "ELOOP";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["EMFILE"] = 24] = "EMFILE";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["ENAMETOOLONG"] = 36] = "ENAMETOOLONG";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["ENFILE"] = 23] = "ENFILE";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["ENOENT"] = 2] = "ENOENT";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["ENOMEM"] = 12] = "ENOMEM";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["ENOSPC"] = 28] = "ENOSPC";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["ENOTDIR"] = 20] = "ENOTDIR";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["EOVERFLOW"] = 75] = "EOVERFLOW";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["EPERM"] = 1] = "EPERM";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["EROFS"] = 30] = "EROFS";
    AdbSyncStatErrorCode[AdbSyncStatErrorCode["ETXTBSY"] = 26] = "ETXTBSY";
})(AdbSyncStatErrorCode || (AdbSyncStatErrorCode = {}));
const AdbSyncStatResponse = new Struct({ littleEndian: true })
    .uint32('error', undefined, placeholder())
    .uint64('dev')
    .uint64('ino')
    .uint32('mode')
    .uint32('nlink')
    .uint32('uid')
    .uint32('gid')
    .uint64('size')
    .uint64('atime')
    .uint64('mtime')
    .uint64('ctime')
    .extra({
    id: AdbSyncResponseId.Stat,
    get type() { return this.mode >> 12; },
    get permission() { return this.mode & 4095; },
})
    .afterParsed((object) => {
    if (object.error) {
        throw new Error(AdbSyncStatErrorCode[object.error]);
    }
});
const StatResponseType = {
    [AdbSyncResponseId.Stat]: AdbSyncStatResponse,
};
const LstatResponseType = {
    [AdbSyncResponseId.Lstat]: AdbSyncLstatResponse,
};
const Lstat2ResponseType = {
    [AdbSyncResponseId.Lstat2]: AdbSyncStatResponse,
};
async function adbSyncLstat(stream, path, v2) {
    let requestId;
    let responseType;
    if (v2) {
        requestId = AdbSyncRequestId.Lstat2;
        responseType = Lstat2ResponseType;
    }
    else {
        requestId = AdbSyncRequestId.Lstat;
        responseType = LstatResponseType;
    }
    await adbSyncWriteRequest(stream, requestId, path);
    return adbSyncReadResponse(stream, responseType);
}
async function adbSyncStat(stream, path) {
    await adbSyncWriteRequest(stream, AdbSyncRequestId.Stat, path);
    return adbSyncReadResponse(stream, StatResponseType);
}

const AdbSyncEntryResponse = AdbSyncLstatResponse
    .afterParsed()
    .uint32('nameLength')
    .string('name', { lengthField: 'nameLength' })
    .extra({ id: AdbSyncResponseId.Entry });
const ResponseTypes = {
    [AdbSyncResponseId.Entry]: AdbSyncEntryResponse,
    [AdbSyncResponseId.Done]: new AdbSyncDoneResponse(AdbSyncEntryResponse.size),
};
async function* adbSyncOpenDir(stream, path) {
    await adbSyncWriteRequest(stream, AdbSyncRequestId.List, path);
    while (true) {
        const response = await adbSyncReadResponse(stream, ResponseTypes);
        switch (response.id) {
            case AdbSyncResponseId.Entry:
                yield response;
                break;
            case AdbSyncResponseId.Done:
                return;
            default:
                throw new Error('Unexpected response id');
        }
    }
}

const AdbSyncDataResponse = new Struct({ littleEndian: true })
    .uint32('dataLength')
    .arrayBuffer('data', { lengthField: 'dataLength' })
    .extra({ id: AdbSyncResponseId.Data });
const ResponseTypes$1 = {
    [AdbSyncResponseId.Data]: AdbSyncDataResponse,
    [AdbSyncResponseId.Done]: new AdbSyncDoneResponse(AdbSyncDataResponse.size),
};
async function* adbSyncPull(stream, path) {
    await adbSyncWriteRequest(stream, AdbSyncRequestId.Receive, path);
    while (true) {
        const response = await adbSyncReadResponse(stream, ResponseTypes$1);
        switch (response.id) {
            case AdbSyncResponseId.Data:
                yield response.data;
                break;
            case AdbSyncResponseId.Done:
                return;
            default:
                throw new Error('Unexpected response id');
        }
    }
}

const AdbSyncOkResponse = new Struct({ littleEndian: true })
    .uint32('unused');
const ResponseTypes$2 = {
    [AdbSyncResponseId.Ok]: AdbSyncOkResponse,
};
async function* chunkAsyncIterable(value, size) {
    let result = new Uint8Array(size);
    let index = 0;
    for await (let buffer of value) {
        // `result` has some data, `result + buffer` is enough
        if (index !== 0 && index + buffer.byteLength >= size) {
            const remainder = size - index;
            result.set(new Uint8Array(buffer, 0, remainder), index);
            yield result.buffer;
            result = new Uint8Array(size);
            index = 0;
            if (buffer.byteLength > remainder) {
                // `buffer` still has some data
                buffer = buffer.slice(remainder);
            }
            else {
                continue;
            }
        }
        // `result` is empty, `buffer` alone is enough
        if (buffer.byteLength >= size) {
            let remainder = false;
            for (const chunk of chunkArrayLike(buffer, size)) {
                if (chunk.byteLength === size) {
                    yield chunk;
                    continue;
                }
                // `buffer` still has some data
                remainder = true;
                buffer = chunk;
            }
            if (!remainder) {
                continue;
            }
        }
        // `result` has some data but `result + buffer` is still not enough
        // or after previous steps `buffer` still has some data
        result.set(new Uint8Array(buffer), index);
        index += buffer.byteLength;
    }
    if (index !== 0) {
        yield result.buffer.slice(0, index);
    }
}
const AdbSyncMaxPacketSize = 64 * 1024;
async function adbSyncPush(stream, filename, content, mode = (LinuxFileType.File << 12) | 0o666, mtime = (Date.now() / 1000) | 0, packetSize = AdbSyncMaxPacketSize, onProgress) {
    const pathAndMode = `${filename},${mode.toString()}`;
    await adbSyncWriteRequest(stream, AdbSyncRequestId.Send, pathAndMode);
    let chunkReader;
    if ('length' in content || 'byteLength' in content) {
        chunkReader = chunkArrayLike(content, packetSize);
    }
    else {
        chunkReader = chunkAsyncIterable(content, packetSize);
    }
    let uploaded = 0;
    for await (const buffer of chunkReader) {
        await adbSyncWriteRequest(stream, AdbSyncRequestId.Data, buffer);
        uploaded += buffer.byteLength;
        onProgress === null || onProgress === void 0 ? void 0 : onProgress(uploaded);
    }
    await adbSyncWriteRequest(stream, AdbSyncRequestId.Done, mtime);
    await adbSyncReadResponse(stream, ResponseTypes$2);
}

var AdbFeatures;
(function (AdbFeatures) {
    AdbFeatures["StatV2"] = "stat_v2";
    AdbFeatures["Cmd"] = "cmd";
})(AdbFeatures || (AdbFeatures = {}));

class AdbSync extends AutoDisposable {
    constructor(adb, stream) {
        super();
        this.sendLock = this.addDisposable(new AutoResetEvent());
        this.adb = adb;
        this.stream = new AdbBufferedStream(stream);
    }
    get supportStat() {
        return this.adb.features.includes(AdbFeatures.StatV2);
    }
    async lstat(path) {
        await this.sendLock.wait();
        try {
            return adbSyncLstat(this.stream, path, this.supportStat);
        }
        finally {
            this.sendLock.notify();
        }
    }
    async stat(path) {
        if (!this.supportStat) {
            throw new Error('Not supported');
        }
        await this.sendLock.wait();
        try {
            return adbSyncStat(this.stream, path);
        }
        finally {
            this.sendLock.notify();
        }
    }
    async isDirectory(path) {
        try {
            await this.lstat(path + '/');
            return true;
        }
        catch (e) {
            return false;
        }
    }
    async *opendir(path) {
        await this.sendLock.wait();
        try {
            yield* adbSyncOpenDir(this.stream, path);
        }
        finally {
            this.sendLock.notify();
        }
    }
    async readdir(path) {
        const results = [];
        for await (const entry of this.opendir(path)) {
            results.push(entry);
        }
        return results;
    }
    async *read(filename) {
        await this.sendLock.wait();
        try {
            yield* adbSyncPull(this.stream, filename);
        }
        finally {
            this.sendLock.notify();
        }
    }
    async write(filename, content, mode, mtime, onProgress) {
        await this.sendLock.wait();
        try {
            await adbSyncPush(this.stream, filename, content, mode, mtime, undefined, onProgress);
        }
        finally {
            this.sendLock.notify();
        }
    }
    dispose() {
        super.dispose();
        this.stream.close();
    }
}

class AdbTcpIpCommand extends AdbCommandBase {
    async setPort(port) {
        if (port <= 0) {
            throw new Error(`Invalid port ${port}`);
        }
        const output = await this.adb.createStreamAndReadAll(`tcpip:${port}`);
        if (output !== `restarting in TCP mode port: ${port}\n`) {
            throw new Error('Invalid response');
        }
    }
    async disable() {
        const output = await this.adb.createStreamAndReadAll('usb:');
        if (output !== 'restarting in USB mode\n') {
            throw new Error('Invalid response');
        }
    }
}

const WebUsbDeviceFilter = {
    classCode: 0xFF,
    subclassCode: 0x42,
    protocolCode: 1,
};

const PrivateKeyStorageKey = 'private-key';
const Utf8Encoder = new TextEncoder();
const Utf8Decoder = new TextDecoder();
function encodeUtf8(input) {
    return Utf8Encoder.encode(input);
}
function decodeUtf8(buffer) {
    return Utf8Decoder.decode(buffer);
}

class AdbWebBackend {
    constructor(device) {
        this.disconnectEvent = new EventEmitter();
        this.onDisconnected = this.disconnectEvent.event;
        this.handleDisconnect = (e) => {
            if (e.device === this._device) {
                this.disconnectEvent.fire();
            }
        };
        this._device = device;
        window.navigator.usb.addEventListener('disconnect', this.handleDisconnect);
    }
    static isSupported() {
        var _a;
        return !!((_a = window.navigator) === null || _a === void 0 ? void 0 : _a.usb);
    }
    static async getDevices() {
        const devices = await window.navigator.usb.getDevices();
        return devices.map(device => new AdbWebBackend(device));
    }
    static async requestDevice() {
        try {
            const device = await navigator.usb.requestDevice({ filters: [WebUsbDeviceFilter] });
            return new AdbWebBackend(device);
        }
        catch (e) {
            switch (e.name) {
                case 'NotFoundError':
                    return undefined;
                default:
                    throw e;
            }
        }
    }
    get serial() { return this._device.serialNumber; }
    get name() { return this._device.productName; }
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
    *iterateKeys() {
        const privateKey = window.localStorage.getItem(PrivateKeyStorageKey);
        if (privateKey) {
            yield decodeBase64(privateKey);
        }
    }
    async generateKey() {
        const { privateKey: cryptoKey } = await crypto.subtle.generateKey({
            name: 'RSASSA-PKCS1-v1_5',
            modulusLength: 2048,
            // 65537
            publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
            hash: 'SHA-1',
        }, true, ['sign', 'verify']);
        const privateKey = await crypto.subtle.exportKey('pkcs8', cryptoKey);
        window.localStorage.setItem(PrivateKeyStorageKey, decodeUtf8(encodeBase64(privateKey)));
        return privateKey;
    }
    encodeUtf8(input) {
        return encodeUtf8(input);
    }
    decodeUtf8(buffer) {
        return decodeUtf8(buffer);
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
    async dispose() {
        window.navigator.usb.removeEventListener('disconnect', this.handleDisconnect);
        this.disconnectEvent.dispose();
        await this._device.close();
    }
}

var AdbPropKey;
(function (AdbPropKey) {
    AdbPropKey["Product"] = "ro.product.name";
    AdbPropKey["Model"] = "ro.product.model";
    AdbPropKey["Device"] = "ro.product.device";
    AdbPropKey["Features"] = "features";
})(AdbPropKey || (AdbPropKey = {}));
class Adb2 {
    constructor(backend, logger) {
        this._connected = false;
        this.packetDispatcher = new AdbPacketDispatcher(backend, logger);
        this.tcpip = new AdbTcpIpCommand(this);
        this.reverse = new AdbReverseCommand(this.packetDispatcher);
        backend.onDisconnected(this.dispose, this);
    }
    get backend() { return this.packetDispatcher.backend; }
    get onDisconnected() { return this.backend.onDisconnected; }
    get connected() { return this._connected; }
    get name() { return this.backend.name; }
    get protocolVersion() { return this._protocolVersion; }
    get product() { return this._product; }
    get model() { return this._model; }
    get device() { return this._device; }
    get features() { return this._features; }
    async connect(authenticators = AdbDefaultAuthenticators) {
        var _a, _b;
        await ((_b = (_a = this.backend).connect) === null || _b === void 0 ? void 0 : _b.call(_a));
        this.packetDispatcher.maxPayloadSize = 0x1000;
        this.packetDispatcher.calculateChecksum = true;
        this.packetDispatcher.appendNullToServiceString = true;
        this.packetDispatcher.start();
        const version = 0x01000001;
        const versionNoChecksum = 0x01000001;
        const maxPayloadSize = 0x100000;
        const features = [
            'shell_v2',
            'cmd',
            AdbFeatures.StatV2,
            'ls_v2',
            'fixed_push_mkdir',
            'apex',
            'abb',
            'fixed_push_symlink_timestamp',
            'abb_exec',
            'remount_shell',
            'track_app',
            'sendrecv_v2',
            'sendrecv_v2_brotli',
            'sendrecv_v2_lz4',
            'sendrecv_v2_zstd',
            'sendrecv_v2_dry_run_send',
        ].join(',');
        const resolver = new PromiseResolver();
        const authHandler = new AdbAuthenticationHandler(authenticators, this.backend);
        const disposableList = new DisposableList();
        disposableList.add(this.packetDispatcher.onPacket(async (e) => {
            e.handled = true;
            const { packet } = e;
            try {
                switch (packet.command) {
                    case AdbCommand.Connect:
                        this.packetDispatcher.maxPayloadSize = Math.min(maxPayloadSize, packet.arg1);
                        const finalVersion = Math.min(version, packet.arg0);
                        this._protocolVersion = finalVersion;
                        if (finalVersion >= versionNoChecksum) {
                            this.packetDispatcher.calculateChecksum = false;
                            // Android prior to 9.0.0 uses char* to parse service string
                            // thus requires an extra null character
                            this.packetDispatcher.appendNullToServiceString = false;
                        }
                        this.parseBanner(this.backend.decodeUtf8(packet.payload));
                        resolver.resolve();
                        break;
                    case AdbCommand.Auth:
                        const authPacket = await authHandler.handle(e.packet);
                        await this.packetDispatcher.sendPacket(authPacket);
                        break;
                    case AdbCommand.Close:
                        // Last connection was interrupted
                        // Ignore this packet, device will recover
                        break;
                    default:
                        throw new Error('Device not in correct state. Reconnect your device and try again');
                }
            }
            catch (e) {
                resolver.reject(e);
            }
        }));
        disposableList.add(this.packetDispatcher.onError(e => {
            resolver.reject(e);
        }));
        // Android prior 9.0.0 requires the null character
        // Newer versions can also handle the null character
        // The terminating `;` is required in formal definition
        // But ADB daemon can also work without it
        await this.packetDispatcher.sendPacket(AdbCommand.Connect, version, maxPayloadSize, `host::features=${features};\0`);
        try {
            await resolver.promise;
            this._connected = true;
        }
        finally {
            disposableList.dispose();
        }
    }
    parseBanner(banner) {
        this._features = [];
        const pieces = banner.split('::');
        if (pieces.length > 1) {
            const props = pieces[1];
            for (const prop of props.split(';')) {
                if (!prop) {
                    continue;
                }
                const keyValue = prop.split('=');
                if (keyValue.length !== 2) {
                    continue;
                }
                const [key, value] = keyValue;
                switch (key) {
                    case AdbPropKey.Product:
                        this._product = value;
                        break;
                    case AdbPropKey.Model:
                        this._model = value;
                        break;
                    case AdbPropKey.Device:
                        this._device = value;
                        break;
                    case AdbPropKey.Features:
                        this._features = value.split(',');
                        break;
                }
            }
        }
    }
    shell() {
        return this.createStream('shell:');
    }
    spawn(command, ...args) {
        // TODO: use shell protocol
        return this.createStream(`shell:${command} ${args.join(' ')}`);
    }
    exec(command, ...args) {
        // TODO: use shell protocol
        return this.createStreamAndReadAll(`shell:${command} ${args.join(' ')}`);
    }
    async getProp(key) {
        const output = await this.exec('getprop', key);
        return output.trim();
    }
    async rm(...filenames) {
        return await this.exec('rm', '-rf', ...filenames.map(arg => escapeArg(arg)));
    }
    async install(apk, onProgress) {
        return await install(this, apk, onProgress);
    }
    async sync() {
        const stream = await this.createStream('sync:');
        return new AdbSync(this, stream);
    }
    
    async framebuffer() {
        return framebuffer(this);
    }
    async createStream(service) {
        return this.packetDispatcher.createStream(service);
    }
    async createStreamAndReadAll(service) {
        const stream = await this.createStream(service);
        const resolver = new PromiseResolver();
        let result = '';
        stream.onData(buffer => {
            result += this.backend.decodeUtf8(buffer);
        });
        stream.onClose(() => resolver.resolve(result));
        return resolver.promise;
    }
    async dispose() {
        this.packetDispatcher.dispose();
        await this.backend.dispose();
    }
}

class AdbWebBackend3 {
    constructor(device) {
        this.disconnectEvent = new EventEmitter();
        this.onDisconnected = this.disconnectEvent.event;
        this.handleDisconnect = (e) => {
            if (e.device === this._device) {
                this.disconnectEvent.fire();
            }
        };
        this._device = device;
        window.navigator.usb.addEventListener('disconnect', this.handleDisconnect);
    }
    static isSupported() {
        var _a;
        return !!((_a = window.navigator) === null || _a === void 0 ? void 0 : _a.usb);
    }

    static async requestDevice() {
        try {
            const device = await navigator.usb.requestDevice({ filters: [WebUsbDeviceFilter] });
            return new AdbWebBackend3(device);
        }
        catch (e) {
            switch (e.name) {
                case 'NotFoundError':
                    return undefined;
                default:
                    throw e;
            }
        }
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
    encodeUtf8(input) {
        return encodeUtf8(input);
    }
    decodeUtf8(buffer) {
        return decodeUtf8(buffer);
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

    async read2(length) {
        const result = await this._device.transferIn(this._inEndpointNumber, length);
        if (result.status === 'stall') {
            await this._device.clearHalt('in', this._inEndpointNumber);
        }
        const { buffer } = result.data;

        const stream = new BufferedStream({
            read(length) {
                return buffer;                
            }
        });
        return AdbPacketStruct.deserialize({
            read: stream.read.bind(stream),
            decodeUtf8: decodeUtf8.bind(this),
            encodeUtf8: encodeUtf8.bind(this),
        });
    }
    async dispose() {
        window.navigator.usb.removeEventListener('disconnect', this.handleDisconnect);
        this.disconnectEvent.dispose();
        await this._device.close();
    }
}

class Adb3 { 
    // This one is dedicated for adb sidelaod
    constructor(backend) {
        this._connected = false;
        this.backend = backend;
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
            //
        }
    }
    parseBanner(banner) {
        this._features = [];
        const pieces = banner.split('::');
        if (pieces.length > 1) {
            const props = pieces[1];
            for (const prop of props.split(';')) {
                if (!prop) {
                    continue;
                }
                const keyValue = prop.split('=');
                if (keyValue.length !== 2) {
                    continue;
                }
                const [key, value] = keyValue;
                switch (key) {
                    case AdbPropKey.Product:
                        this._product = value;
                        break;
                    case AdbPropKey.Model:
                        this._model = value;
                        break;
                    case AdbPropKey.Device:
                        this._device = value;
                        break;
                    case AdbPropKey.Features:
                        this._features = value.split(',');
                        break;
                }
            }
        }
    }
    spawn(command, ...args) {
        // TODO: use shell protocol
        return this.createStream(`shell:${command} ${args.join(' ')}`);
    }
    exec(command, ...args) {
        // TODO: use shell protocol
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
        //const remoteId = await initializer;
        const r = await AdbPacket.read(this.backend);
        if (r.command == AdbCommand.OK) {
            remoteId = r.arg0;
            const controller = new AdbStreamController(localId, remoteId, this);
            return new AdbStream(controller);
        }
    }

    async dispose() {
        this.packetDispatcher.dispose();
        await this.backend.dispose();
    }
}
