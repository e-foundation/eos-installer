import { WDebug } from "./debug.js";
import { ErrorManager } from "./errorManager.js";
import { Controller } from "./controller.manager.js";
import { TranslationManager } from "./vue/translation.manager.js";

/*
 * Class to manage events
 * from the buttons events to the event of the controller and fastboot
 * it's just log for now, but maybe it will be more useful for dynamic display
 */

export default class ViewManager {
  constructor() {}

  async init() {
    this.WDebug = WDebug;
    this.ErrorManager = ErrorManager;
    this.controller = new Controller();
    this.downloadChoiceEnabled =
      new URLSearchParams(window.location.search).get("download") === "0";
    this.controller.setDownloadChoiceEnabled(this.downloadChoiceEnabled);
    await this.controller.init(this);
    this.translationManager = new TranslationManager();
    await this.translationManager.init();
    window.scroll(0, 0);
  }

  selectStep(currentIndex, step) {
    const $stepIndex = document.getElementById("current-step");
    $stepIndex.innerText = currentIndex + 1;

    const $step = document.getElementById(step.name);
    if ($step) {
      const $copyStep = $step.cloneNode(true);
      $copyStep.id = step.id;
      $copyStep.classList.add("active");
      $copyStep.classList.remove("inactive");
      $copyStep.style.position = "relative";
      if (step.name === "downloading") {
        const progressArea = $copyStep.querySelector(".download-progress-area");
        const actions = $copyStep.querySelector(".download-actions");
        if (this.downloadChoiceEnabled) {
          if (progressArea) {
            progressArea.style.display = "none";
          }
          this.bindDownloadChoice($copyStep, step);
        } else {
          if (actions) {
            actions.style.display = "none";
          }
          if (progressArea) {
            progressArea.style.display = "block";
          }
        }
      } else {
        const $button = $copyStep.querySelector("button");
        if ($button) {
          $button.addEventListener("click", async (event) => {
            event.stopPropagation();
            await this.executeStep($button, step.name);
          });
        }
      }
      let $processCtn = document.getElementById("process-ctn");
      if ($processCtn) {
        $processCtn.appendChild($copyStep);
        setTimeout(() => {
          $copyStep.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 100);
      }
    }
  }

  updateTotalStep(total) {
    const $total = document.getElementById("total-step");
    $total.innerText = total;
  }
  // BUTTON EVENTS

  async onNext($button) {
    $button.disabled = true;
    try {
      await this.controller.next();
    } catch (e) {
      this.ErrorManager.displayError_state(
        "Error on next",
        `${e.message || e}`,
      );
      $button.disabled = false;
    }
  }
  async executeStep($button, stepName) {
    $button.disabled = true;
    let loader = $button.querySelector(".btn-loader");
    if (loader) {
      loader.style.display = "inline-block";
    }

    try {
      await this.controller.executeStep(stepName, loader);
    } catch (e) {
      this.ErrorManager.displayError_state(
        `Error on step: ${stepName}`,
        `${e.message || e}`,
      );
      $button.disabled = false;
    } finally {
      if (loader) {
        loader.style.display = "none";
      }
    }
  }
  onStepStarted(currentIndex, currentStep) {
    this.selectStep(currentIndex, currentStep);
  }

  onStepFinished(currentStep, nextStep) {
    if (currentStep) {
      const $currentStep = document.getElementById(currentStep.id);
      if ($currentStep) {
        const $button = $currentStep.getElementsByClassName("next");
        const $check = document.createElement("IMG");
        $check.src = "assets/images/icons/check.svg";
        if ($button[0]) {
          $button[0].replaceWith($check);
        }

        $currentStep.classList.add("done");
        $currentStep.classList.remove("active");
      }
    }
    if (nextStep) {
      /*const $next = document.getElementById(nextStep.id);
            $next.disabled = !nextStep.needUser;*/
    }
  }
  onStepFailed() {}

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
    this.showProgressAreaIfHidden();
    const v = Math.round((loaded / total) * 100);
    let $progressBar = document.querySelector(
      `.active .downloading-progress-bar`,
    );
    let $progress = document.querySelector(`.active .downloading-progress`);
    if ($progressBar) {
      $progressBar.value = v;
    }
    if ($progress) {
      $progress.innerText = `Downloading ${name}: ${v}/${100}`;
    }
    this.lastProgressPhase = "download";
    this.WDebug.log(`Downloading ${name}: ${v}/${100}`, `downloading-${name}`);
  }

  onVerify(name, loaded, total) {
    this.showProgressAreaIfHidden();
    const v = Math.round((loaded / total) * 100);
    let $progressBar = document.querySelector(
      `.active .downloading-progress-bar`,
    );
    let $progress = document.querySelector(`.active .downloading-progress`);
    if ($progressBar) {
      $progressBar.value = v;
    }
    if ($progress) {
      $progress.innerText = `Verifying ${name}: ${v}/${100}`;
    }
    this.lastProgressPhase = "verify";
    this.WDebug.log(`Verifying ${name}: ${v}/${100}`, `verifying-${name}`);
  }

  onUnzip(name, loaded, total) {
    this.showProgressAreaIfHidden();
    const v = Math.round((loaded / total) * 100);
    let $progressBar = document.querySelector(
      `.active .downloading-progress-bar`,
    );
    let $progress = document.querySelector(`.active .downloading-progress`);
    if ($progressBar) {
      $progressBar.value = v;
    }
    if ($progress) {
      $progress.innerText = `Extracting ${name}: ${v}/${100}`;
    }
    this.lastProgressPhase = "unzip";
    this.WDebug.log(`Unzipping ${name}: ${v}/${100}`, `Unzipping-${name}`);
  }
  onDownloadingEnd() {
    let $progressBar = document.querySelector(
      `.active .downloading-progress-bar`,
    );
    if ($progressBar) {
      $progressBar.value = $progressBar.max || 100;
      $progressBar.classList.add("success");
    }
    let $progress = document.querySelector(`.active .downloading-progress`);
    if ($progress) {
      const usedLocal = this.controller?.deviceManager?.hasLocalZipFile();
      let doneText = "Download is complete!";
      if (usedLocal) {
        if (this.lastProgressPhase === "verify") {
          doneText = "Verification complete!";
        } else if (this.lastProgressPhase === "unzip") {
          doneText = "Extraction complete!";
        } else {
          doneText = "Local ZIP is ready!";
        }
      }
      $progress.innerText = doneText;
    }
    let $ready = document.querySelector(`.active .ready-to-install-e-os `);
    if ($ready) {
      $ready.style.display = `block`;
    }
  }

  async onInstalling(name, loaded, total) {
    const v = Math.round((loaded / total) * 100);
    let $progressBar = document.querySelector(
      `.active .installing-progress-bar`,
    );
    let $progress = document.querySelector(`.active .installing-progress`);
    if ($progressBar) {
      $progressBar.value = v;
    }
    if ($progress) {
      $progress.innerText = `Installing ${name}: ${v}/${100}`;
    }
    this.WDebug.log(
      `Installing ${name}: ${Math.round(v * 100)}/${100}`,
      `installing-${name}`,
    );
  }
  updateData(key, value) {
    let $subscribers = document.querySelectorAll(`[data-subscribe="${key}"]`);
    this.WDebug.log($subscribers);
    this.WDebug.log({
      [key]: value,
    });
    for (let i = 0; i < $subscribers.length; i++) {
      this.translationManager.translateElement($subscribers[i], {
        [key]: value,
      });
    }
  }

  // /CONTROLLER EVENTS
  bindDownloadChoice($copyStep, step) {
    const downloadBtn = $copyStep.querySelector(".download-build-button");
    const localBtn = $copyStep.querySelector(".use-local-zip-button");
    const fileInput = $copyStep.querySelector(".local-zip-input");
    const errorEl = $copyStep.querySelector(".local-zip-error");
    const progressArea = $copyStep.querySelector(".download-progress-area");
    const progressBar = $copyStep.querySelector(".downloading-progress-bar");
    const progressText = $copyStep.querySelector(".downloading-progress");

    if (downloadBtn) {
      downloadBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (errorEl) {
          errorEl.style.display = "none";
          errorEl.innerText = "";
        }
        this.controller.clearLocalZip();
        this.showProgressAreaIfHidden(progressArea);
        if (progressBar) {
          progressBar.value = 0;
          progressBar.classList.remove("success");
        }
        if (progressText) {
          progressText.innerText = "";
        }
        await this.executeStep(downloadBtn, step.name);
      });
    }

    if (localBtn && fileInput) {
      localBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (errorEl) {
          errorEl.style.display = "none";
          errorEl.innerText = "";
        }
        fileInput.value = "";
        fileInput.click();
      });

      fileInput.addEventListener("change", async (evt) => {
        const file = evt.target.files[0];
        if (!file) {
          return;
        }
        if (!file.name.toLowerCase().endsWith(".zip")) {
          if (errorEl) {
            errorEl.innerText = "Please select a .zip file.";
            errorEl.style.display = "block";
          }
          fileInput.value = "";
          return;
        }
        if (errorEl) {
          errorEl.style.display = "none";
          errorEl.innerText = "";
        }
        this.showProgressAreaIfHidden(progressArea);
        if (progressBar) {
          progressBar.value = 0;
          progressBar.classList.remove("success");
        }
        if (progressText) {
          progressText.innerText = "";
        }
        this.controller.setLocalZip(file);
        await this.executeStep(localBtn, step.name);
      });
    }
  }

  showProgressAreaIfHidden(progressAreaOverride) {
    const area =
      progressAreaOverride ||
      document.querySelector(".active .download-progress-area");
    if (area && area.style.display === "none") {
      area.style.display = "block";
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  var VIEW = new ViewManager();
  await VIEW.init();

  let elts = document.querySelectorAll(".card button");
  for (let elt of elts) {
    const card = elt.closest(".card");
    if (!card || card.className.includes("inactive")) {
      continue;
    }
    elt.addEventListener("click", async () => {
      VIEW.executeStep(elt, card.id);
    });
  }
});

window.onload = function () {
  if (!("usb" in navigator)) {
    document.getElementById("overlay-background").classList.remove("inactive");
    document
      .getElementById("navigator-not-supported")
      .classList.remove("inactive");
    document
      .getElementById("let-s-get-started-button")
      .classList.add("inactive");
  }
};
