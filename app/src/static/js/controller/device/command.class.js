export class Command {
    static CMD_TYPE = {
        flash: 'flash',
        sideload: 'sideload',
        erase: 'erase',
        unlock: 'unlock',
        lock: 'lock',
        echo: 'echo',
        connect: 'connect',
        reboot: 'reboot',
    }

    static parseCommand(cmd) {
        const res = cmd.split(' ').map(m => m.trim()).filter(m => m != '');
        switch (res[0]) {
            case 'echo':
                return {
                    command: cmd,
                    type: Command.CMD_TYPE.echo,
                }
            case 'connect':
                return {
                    command: cmd,
                    type: Command.CMD_TYPE.connect,
                    mode: res[1], // adb or fastboot
                }
            case 'flash':
                return {
                    command: cmd,
                    type: Command.CMD_TYPE.flash,
                    partition: res[1],
                    file: res[2]
                }
            case 'sideload':
                return {
                    command: cmd,
                    type: Command.CMD_TYPE.sideload,
                    file: res[1],
                }
            case 'erase':
                return {
                    command: cmd,
                    type: Command.CMD_TYPE.erase,
                    partition: res[1],
                }
            case 'reboot':
                return {
                    command: cmd,
                    type: Command.CMD_TYPE.reboot,
                    mode: res[1], // adb, fastboot or recovery
                }
            case 'flashing':
            case 'oem':
                if (res[1].startsWith('unlock')) {
                    return {
                        command: `${res[0]} ${res[1]}`,
                        type: Command.CMD_TYPE.unlock,
                        partition: res[2],
                    }
                } else if (res[1].startsWith('lock')) {
                    return {
                        command: `${res[0]} ${res[1]}`,
                        type: Command.CMD_TYPE.lock,
                        partition: res[2],
                    }
                }
        }
        return {
            command: cmd
        };
    }

    static encodeCmd = function (cmd) {
        const encoder = new TextEncoder();
        const buffer = encoder.encode(cmd).buffer;
        const view = new DataView(buffer);
        return view.getUint32(0, true);
    }

    static decodeCmd = function (cmd) {
        const decoder = new TextDecoder();
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setUint32(0, cmd, true);
        return decoder.decode(buffer);
    }


}