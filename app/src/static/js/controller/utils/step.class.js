import {Command} from "../device/command.class.js";

export class Step {
    constructor(name,  command, needUserGesture,mode) {
        this.name = name;
        this.id = new Date().getTime() + Math.round((Math.random() * 1000));
        this.needUserGesture = needUserGesture;
        this.commands = [];
        if(command) {
            if(Array.isArray(command)){
                this.commands = command.map(m => {
                    return new Command(m)
                });
            } else {
                this.commands = [new Command(command)];
            }
        }
        this.mode = mode;
    }

}