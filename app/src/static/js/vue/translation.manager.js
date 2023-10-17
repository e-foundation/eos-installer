/*
* Class to manage translation
* simply listen on the translation's select and update DOM
* also change single Node text if needed
* [data-translate] is used to find Nodes needing translation
*/
class TranslationManager {
    constructor() {
        this.translation = {};
    }

    async init() {
        this.$select = document.getElementById('translation');
        this.$select.addEventListener('change', ($event) => {
            this.onSelectTranslationChange($event);
        });
        await this.changeTranslation(this.$select.value);
    }

    async onSelectTranslationChange($event) {
        if (this.$select.value) {
            await this.changeTranslation(this.$select.value);
        }
    }

    async changeTranslation(translation) {
        if (this.local !== translation) {
            this.local = translation;
            await this.loadTranslation(translation);
            this.translateDOM();
        }
    }

    async loadTranslation() {
        this.translation = await (await fetch(`assets/languages/${this.local}.json`)).json() || {};
    }

    translateDOM() {
        const elems = document.querySelectorAll('[data-translate]');
        for (let i = 0; i < elems.length; i++) {
            elems[i].innerText = this.translate(elems[i].dataset.translate);
        }
    }

    translate(key) {
        return this.translation[key] || key;
    }

}