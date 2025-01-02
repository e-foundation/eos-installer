export class Helper {
    static paddit(text, width, padding) {
        const padlen = width - text.length;
        let padded = '';
        for (let i = 0; i < padlen; i++) {
            padded += padding;
        }
        return padded + text;
    }

    static toHex8(num) {
        return this.paddit(num.toString(16), 2, '0');
    }

    static toHex16(num) {
        return this.paddit(num.toString(16), 4, '0');
    }

    static toHex32(num) {
        return this.paddit(num.toString(16), 8, '0');
    }

    static hexdump(view, prefix = '') {
        const decoder = new TextDecoder();
        let global = '';
        for (let i = 0; i < view.byteLength; i += 16) {
            const max = (view.byteLength - i) > 16 ? 16 : (view.byteLength - i);
            let row = prefix + this.toHex16(i) + ' ';
            let j;
            for (j = 0; j < max; j++) {
                row += ' ' + this.toHex8(view.getUint8(i + j));
            }
            for (; j < 16; j++) {
                row += '   ';
            }
            row += ' | ' + decoder.decode(new DataView(view.buffer, i, max));
            global += row;
        }
        return global;
    }

    static encodeCmd(cmd) {
        const encoder = new TextEncoder();
        const buffer = encoder.encode(cmd).buffer;
        const view = new DataView(buffer);
        return view.getUint32(0, true);
    }

    static decodeCmd(cmd) {
        const decoder = new TextDecoder();
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setUint32(0, cmd, true);
        return decoder.decode(buffer);
    }
}
