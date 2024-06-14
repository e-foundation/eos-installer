export class Command {
    static CMD_TYPE = {
        flash: 'flash',
        sideload: 'sideload',
        erase: 'erase',
        unlock: 'unlock',
        lock: 'lock',
        connect: 'connect',
        reboot: 'reboot',
        downloading: 'downloading',
    };

    constructor(cmd) {
        this.command = cmd;
        this.type = undefined;
        this.mode = undefined;
        this.partition = undefined;
        this.file = undefined;
        this.parseCommand(cmd);
    }

     parseCommand(cmd) {
        const res = cmd.split(' ').map(m => m.trim()).filter(m => m != '');
        console.log(cmd)
        switch (res[0]) {
            case 'download':
                this.type = Command.CMD_TYPE.download;
                break
            case 'connect':
                this.type = Command.CMD_TYPE.connect;
                this.mode = res[1]; // adb or fastboot;
                break
            case 'flash':
                this.type = Command.CMD_TYPE.flash;
                this.partition = res[1];
                this.file = res[2];
                break;
            case 'sideload':
                this.type = Command.CMD_TYPE.sideload;
                this.file = res[1];
                break;
            case 'erase':
                this.type = Command.CMD_TYPE.erase;
                this.partition = res[1];
                break;
            case 'reboot':
                this.type = Command.CMD_TYPE.reboot;
                this.mode = res[1];
                break;
            case 'flashing':
            case 'oem':
                this.command = `${res[0]} ${res[1]}`;
                this.partition = res[2];
                if (res[1].startsWith('unlock')) {
                    this.type = Command.CMD_TYPE.unlock;
                } else if (res[1].startsWith('lock')) {
                    this.type = Command.CMD_TYPE.lock;
                }
                break;
        }
    }
}