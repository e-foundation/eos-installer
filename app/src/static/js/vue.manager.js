/*
* Class to manage events
* from the buttons events to the event of the controller and fastboot
* it's just log for now, but maybe it will be more usefull for dynamic display
*/
class VueManager {
    constructor() {
        this.logManager = new LogManager();
        this.translationManager = new TranslationManager();
    }

    async init() {
        const pr = await import("./controller.manager.js");
        this.$process = document.getElementById('process');
        this.$stepTitle = document.getElementById('step-title');
        this.controller = new pr.Controller();
        await this.controller.init();
        await this.logManager.init();
        await this.translationManager.init();
    }

    renderProcess(steps) {
        const $process = this.$process;
        for (let i = 0; i < steps.length; i++) {
            $process.appendChild(this.getStepNode(i, steps[i]));
        }
        this.translationManager.translateDOM();
    }
    clearProcess(){
        this.$process.innerHTML = '';
    }

    onStepStarted(currentStep){
        if (currentStep.title && currentStep?.title !== currentStep.title) {
            this.$stepTitle.innerText = this.translationManager.translate(currentStep.title);
        }
        this.selectStep(currentStep);
    }
    onStepFinished(currentStep, nextStep){
        if (currentStep) {
            if (currentStep.done) {
                const $currentStep = document.getElementById(currentStep.id);
                $currentStep.classList.add('done');
            }
        }
        if (nextStep) {
            const $next = document.getElementById('next');
            $next.disabled = !nextStep.needUser;
        }
    }
    selectStep(step){
        const $steps = document.getElementsByClassName('step active');
        for (let i = 0; i < $steps.length; i++) {
            $steps[i].classList.add('inactive');
            $steps[i].classList.remove('active');
        }
        const $step = document.getElementById(step.id);
        if ($step) {
            $step.classList.add('active');
            $step.classList.remove('inactive');
        }
    }
    getStepNode(index, step) {
        const $instruction = document.createElement('div');
        $instruction.dataset.title = step.title;
        $instruction.dataset.translate = step.instruction || step.command;
        $instruction.dataset.index = index;
        $instruction.id = step.id;
        $instruction.classList.add('step', 'inactive');
        return $instruction;
    }

    // BUTTON EVENTS

    onNext($button) {
        this.controller.next(true);
    }
    // /BUTTON EVENTS

    /*
    * STEP 1 : Connect
    */
    onADBConnect() {
        this.logManager.log(`Device connected !`);
    }

    // CONTROLLER EVENTS
    async onModelSupported(model) {
        this.logManager.log(`Device ${model} supported`);
        //this.render(await this.controller.getData());
    }

    async onModelNotSupported(model) {
        this.logManager.log(`Device ${model} not supported`);
        //this.render(await this.controller.getData());
    }


    async onCommandExecuted(cmd) {
        this.logManager.log(`${cmd} executed`);
    }
    async onCheckDeviceConnection() {
        this.logManager.log(`trying to reconnect phone`);
        //this.render(await this.controller.getData());
    }

    async onNeedUnlock() {
        this.logManager.log(`Need unlock`);
        //this.render(await this.controller.getData());
    }

    async onNeedKey() {
        this.logManager.log(`Need key install`);
        //this.render(await this.controller.getData());
    }

    async onNeedLock() {
        this.logManager.log(`Need lock`);
        //this.render(await this.controller.getData());
    }

    async onInstallPatch() {
        this.logManager.log(`Installing patch`);
        //this.render(await this.controller.getData());
    }

    async onInstallPatchFinished() {
        this.logManager.log(`Installing patch finished`);
        //this.render(await this.controller.getData());
    }

    async onInstallRom() {
        this.logManager.log(`Installing rom`);
        //this.render(await this.controller.getData());
    }

    async onInstallRomFinished() {
        this.logManager.log(`Installing rom finished`);
        //this.render(await this.controller.getData());
    }

    async onFinished() {
        this.logManager.log(`Installing finished`);
        //this.render(await this.controller.getData());
    }

    async onInstallRecovery() {
        this.logManager.log(`Installing recovery`);
        //this.render(await this.controller.getData());
    }

    async onInstallRecoveryFinished() {
        this.logManager.log(`Installing recovery finished`);
        //this.render(await this.controller.getData());
    }

    async onInstallKey() {
        this.logManager.log(`Installing key`);
        //this.render(await this.controller.getData());
    }

    async onInstallKeyFinished() {
        this.logManager.log(`Installing key finished`);
        //this.render(await this.controller.getData());
    }

    async onBootloaderConnected() {
        this.logManager.log(`phone reconnected !`);
        //this.render(await this.controller.getData());
    }

    async onConnectBootloaderNeeded() {
        this.logManager.log(`need user to connect phone`);
        //this.render(await this.controller.getData());
    }

    async onWaiting() {
        this.logManager.log(`.`);
    }

    async onStartDownloading(id) {
        this.logManager.log(`Downloading ${id}`, `downloading-${id}`);
        //this.logManager.log(`Downloading ${id}`);
        //this.render(await this.controller.getData());
    }

    async onEndDownloading(id) {
        this.logManager.log(`Downloading ${id} ended`, `downloading-${id}`);
        //this.render(await this.controller.getData());
        //this.logManager.log(`Downloading ${id}`);
        //this.render(await this.controller.getData());
    }

    async onDownloading(id, loaded, total) {
        let progress = document.getElementById(`downloading-${id} : '' }-progress-bar`);
        const v = loaded / total;
        if (progress) {
            progress.value = v;
        }
        this.logManager.log(`Downloading ${id}: ${Math.round(v * 100)}/${100}`, `downloading-${id}`);
    }

    async onUnzip(id, loaded, total) {
        let progress = document.getElementById(`unzipping-${id} : '' }-progress-bar`);
        const v = loaded / total;
        if (progress) {
            progress.value = v;
        }
        this.logManager.log(`Unzipping ${id}: ${Math.round(v * 100)}/${100}`, `downloading-${id}`);
    }

    async onInstalling(id, loaded, total) {
        let progress = document.getElementById(`installing-${id} : '' }-progress-bar`);
        const v = loaded / total;
        if (progress) {
            progress.value = v;
        }
        this.logManager.log(`Installing ${id}: ${Math.round(v * 100)}/${100}`, `installing-${id}`);
    }
    // /CONTROLLER EVENTS
}