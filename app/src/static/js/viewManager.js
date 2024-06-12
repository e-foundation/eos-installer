/*
* Class to manage events
* from the buttons events to the event of the controller and fastboot
* it's just log for now, but maybe it will be more usefull for dynamic display
*/
class ViewManager {
    constructor() {
    }

    async init() {
        const cm = await import("./controller.manager.js");
        const lm = await import("./vue/log.manager.js");
        const tm = await import("./vue/translation.manager.js");
        this.controller = new cm.Controller();
        await this.controller.init();
        this.logManager = new lm.LogManager();
        await this.logManager.init();
        this.translationManager = new tm.TranslationManager();
        await this.translationManager.init();
    }

    selectStep(step) {
        const $step = document.getElementById(step.id);
        if ($step) {
            $step.classList.add('active');
            $step.classList.remove('inactive');
        }
        $step.scrollIntoView({ behavior: "smooth", block: "nearest"});
    }

    // BUTTON EVENTS

    async onNext($button) {
        $button.disabled = true;
        try {
            await this.controller.next();
        } catch (e) {
            $button.disabled = false;
        } finally {
        }
    }
    async executeStep($button, stepId) {
        $button.disabled = true;
        try {
            await this.controller.executeStep(stepId);
        } catch (e) {
            $button.disabled = false;
        } finally {
        }

    }
    onStepStarted(currentStep) {
        this.selectStep(currentStep);
    }

    onStepFinished(currentStep, nextStep) {
        if (currentStep) {
            const $currentStep = document.getElementById(currentStep.id);
            if($currentStep){
                const $button = $currentStep.getElementsByClassName('next');
                const $check = document.createElement('IMG');
                $check.src = "assets/images/icons/check.svg";
                if($button[0]){
                    $button[0].replaceWith($check);
                }

                $currentStep.classList.add('done');
                $currentStep.classList.remove('active');
            }
        }
        if (nextStep) {
            /*const $next = document.getElementById(nextStep.id);
            $next.disabled = !nextStep.needUser;*/
        }
    }
    onStepFailed(step){

    }

    // /BUTTON EVENTS

    /*
    * STEP 1 : Connect
    */
    onADBConnect() {
        this.logManager.log(`Device connected !`);
    }

    async onWaiting() {
        this.logManager.log(`.`);
    }

     onDownloading(id, loaded, total) {
        let progress = document.getElementById(`downloading-progress-bar`);
         const v = Math.round(loaded / total * 100) ;
        if (progress) {
            progress.value = v;
        }
        this.logManager.log(`Downloading ${id}: ${Math.round(v * 100)}/${100}`, `downloading-${id}`);
    }

    onUnzip(id, loaded, total) {
        let progress = document.getElementById(`downloading-progress-bar`);
        const v = Math.round(loaded / total * 100) ;
        if (progress) {
            progress.value = v;
        }
        this.logManager.log(`Unzipping ${id}: ${Math.round(v * 100)}/${100}`, `downloading-${id}`);
    }

    async onInstalling(id, loaded, total) {
        let progress = document.getElementById(`installing-progress-bar`);
        const v = loaded / total;
        if (progress) {
            progress.value = v;
        }
        this.logManager.log(`Installing ${id}: ${Math.round(v * 100)}/${100}`, `installing-${id}`);
    }

    // /CONTROLLER EVENTS
}