import {Command} from "../device/command.class.js";

export class Step {
    constructor(id, index, command, needUserGesture,mode) {
        this.id = id;
        this.index = index;
        this.needUserGesture = needUserGesture;
        this.commands = [];
        if(command) {
            if(Array.isArray(command)){
                this.commands = command.map(m => new Command(m) );
                console.log(this.commands)
            } else {
                this.commands = [new Command(command)];
            }
        }
        this.mode = mode;
    }

}