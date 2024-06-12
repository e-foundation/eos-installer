import {Command} from "../device/command.class.js";

export class Step {
    constructor(id, index, command, needUserGesture,mode) {
        this.id = id;
        this.index = index;
        this.needUserGesture = needUserGesture;
        if(command) {
            this.command = new Command(command);
        }
        this.mode = mode;
    }

}