import {Command} from "../device/command.class.js";

export class Step {
    constructor(id,  command, needUserGesture,mode) {
        this.id = id;
        this.needUserGesture = needUserGesture;
        this.commands = [];
        if(command) {
            if(Array.isArray(command)){
                this.commands = command.map(m => {
                    return new Command(m)
                });
                console.log(this.commands)
            } else {
                this.commands = [new Command(command)];
            }
        }
        this.mode = mode;
    }

}