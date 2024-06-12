/*
* Class to manage translation
* simply listen on the translation's select and update DOM
* also change single Node text if needed
* [data-translate] is used to find Nodes needing translation
*/
export class TranslationManager {
    constructor() {
        this.translation = {};
        this.values = {};
    }

    async init() {
        await this.DOMListener();
        await this.renderTranslation('en'); //default translation is en.json
    }

    async DOMListener(){
        this.$select = document.getElementById('translation');
        if(!!this.$select) {
            this.$select.addEventListener('change', ($event) => {
                this.onSelectTranslationChange($event);
            });
            await this.renderTranslation(this.$select.value);
        }
    }

    async onSelectTranslationChange($event) {
        if (this.$select.value) {
            await this.renderTranslation(this.$select.value);
        }
    }

    async renderTranslation(translation) {
        if (this.local !== translation) {
            this.local = translation;
            await this.loadTranslation(translation);
            this.translateDOM();
        }
    }

    async loadTranslation() {
        this.translation = await (await fetch(`assets/languages/${this.local}.json`)).json() || {};
    }

    async changeValue(key, value){
    }

    translateDOM() {
        const elems = document.querySelectorAll('[data-translate]');
        for (let i = 0; i < elems.length; i++) {
            elems[i].innerHTML = this.translate(elems[i].dataset.translate);
        }
    }

    translate(key, values) {
        let text = this.translation[key];
        if(!text) {
            console.warn(`translation of ${key} not found`)
            text = key;
        }
        //I have to choose tags, so I'm using Mustache tags
        //I'm not adding the lib since it's not necessary
        //But if one day it is, the translation does not have to change :>
        if(typeof values === 'object') {
            Object.keys(values).forEach(k => {
                text.replaceAll(`{{${k}}}`, values[key]);
            });
        }
        return text;
    }

}