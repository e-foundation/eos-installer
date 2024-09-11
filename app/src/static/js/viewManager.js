
/*
* Class to manage events
* from the buttons events to the event of the controller and fastboot
* it's just log for now, but maybe it will be more usefull for dynamic display
*/

class ViewManager {
    
    constructor() {
   
    }

    async init() {
        const wdebug = await import ("./debug.js");
        this.WDebug = wdebug.WDebug;
        const errorManager = await import ("./errorManager.js");
        this.ErrorManager = errorManager.ErrorManager;

        const cm = await import("./controller.manager.js");
        const tm = await import("./vue/translation.manager.js");
        this.controller = new cm.Controller();
        await this.controller.init();
        this.translationManager = new tm.TranslationManager();
        await this.translationManager.init();
    }

    selectStep(currentIndex, step) {
        const $stepIndex = document.getElementById('current-step');
        $stepIndex.innerText = currentIndex+1;

        const $step = document.getElementById(step.name);
        if ($step) {
            const $copyStep = $step.cloneNode(true);
            $copyStep.id = step.id;
            $copyStep.classList.add('active');
            $copyStep.classList.remove('inactive');
            let $processCtn = document.getElementById('process-ctn');
            if($processCtn){
                $processCtn.appendChild($copyStep);
                setTimeout(() => {
                    $copyStep.scrollIntoView({ behavior: "smooth", block: "end"});
                }, 100);
            }
        }
    }

    updateTotalStep(total){
        const $total = document.getElementById('total-step');
        $total.innerText = total;
    }
    // BUTTON EVENTS

    async onNext($button) {
        $button.disabled = true;
        try {
            await this.controller.next();
        } catch (e) {
            this.ErrorManager.displayError_state('Error on next', `${e.message || e}`);
            $button.disabled = false;
        } finally {
        }
    }
    async executeStep($button, stepName) {
        $button.disabled = true;
        let loader = $button.querySelector('.btn-loader');
        if(loader) {
            loader.style.display = 'inline-block';
        }

        try {
            await this.controller.executeStep(stepName);
        } catch (e) {
            this.ErrorManager.displayError_state(`Error on step: ${stepName}`, `${e.message || e}`);
            $button.disabled = false;
        } finally {
            if(loader) {
                loader.style.display = 'none';
            }
        }

    }
    onStepStarted(currentIndex, currentStep) {
        this.selectStep(currentIndex, currentStep);
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
        this.WDebug.log(`Device connected !`);
    }

    async onWaiting() {
        this.WDebug.log(`.`);
    }

     onDownloading(name, loaded, total) {
        const v = Math.round(loaded / total * 100) ;
        let $progressBar = document.querySelector(`.active .downloading-progress-bar`);
        let $progress = document.querySelector(`.active .downloading-progress`);
        if ($progressBar) {
            $progressBar.value = v;
        }
        if ($progress) {
            $progress.innerText = `Downloading ${name}: ${v}/${100}`;
        }
        this.WDebug.log(`Downloading ${name}: ${v}/${100}`, `downloading-${name}`);
    }

    onUnzip(name, loaded, total) {
        const v = Math.round(loaded / total * 100) ;
        let $progressBar = document.querySelector(`.active .downloading-progress-bar`);
        let $progress = document.querySelector(`.active .downloading-progress`);
        if ($progressBar) {
            $progressBar.value = v;
        }
        if ($progress) {
            $progress.innerText = `Extracting ${name}: ${v}/${100}`;
        }
        this.WDebug.log(`Unzipping ${name}: ${v}/${100}`, `Unzipping-${name}`);
    }
    onDownloadingEnd() {
        let $progressBar = document.querySelector(`.active .downloading-progress-bar`);
        if ($progressBar) {
            $progressBar.classList.add('success');
        }
        let $progress = document.querySelector(`.active .downloading-progress`);
        if ($progress) {
            $progress.innerText = `Download is complete!`;
        }
        let $ready = document.querySelector(`.active .ready-to-install-e-os `);
        if ($ready) {
            $ready.style.display = `block`;
        }
    }

    async onInstalling(name, loaded, total) {
        const v = Math.round(loaded / total * 100) ;
        let $progressBar = document.querySelector(`.active .installing-progress-bar`);
        let $progress = document.querySelector(`.active .installing-progress`);
        if ($progressBar) {
            $progressBar.value = v;
        }
        if ($progress) {
            $progress.innerText = `Installing ${name}: ${v}/${100}`;
        }
        this.WDebug.log(`Installing ${name}: ${Math.round(v * 100)}/${100}`, `installing-${name}`);
    }
    updateData(key, value){
        let $subscribers = document.querySelectorAll(`[data-subscribe="${key}"]`);
        this.WDebug.log($subscribers);
        this.WDebug.log({
            [key] : value
        });
        for(let i = 0 ; i< $subscribers.length; i++) {
            this.translationManager.translateElement($subscribers[i],  {
                [key] : value
            })
        }
    }

    // /CONTROLLER EVENTS
}