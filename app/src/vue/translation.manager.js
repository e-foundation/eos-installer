/*
 * Class to manage translation
 * fetch translation file & use the correct language for the user
 * also change single Node text if needed
 * [data-translate] is used to find Nodes needing translation
 */
import { WDebug } from "../debug.js";

export class TranslationManager {
  static DEFAULT = "en"; //if user languages not found, fallback to 'en'
  constructor() {
    this.translation = {};
    this.values = {};
    this.languages = TranslationManager.getAcceptedLanguages();
    this.languageIndex = 0;
  }

  async init() {
    await this.loadCurrentTranslation(); // fetch translation
    await this.translateDOM(); // use it for DOM
  }
  /**
   * @returns string
   * using the current languageIndex, we retrieve the string language
   * ex 'fr-FR'
   */
  getCurrentLanguage() {
    return this.languages[this.languageIndex];
  }
  async loadCurrentTranslation() {
    const language = this.getCurrentLanguage();
    const shortLanguage = TranslationManager.getShortLanguage(language);
    try {
      this.translation =
        await TranslationManager.fetchTranslation(shortLanguage);
    } catch (e) {
      //if language not found, fallback to next language
      if (this.languageIndex < this.languages.length) {
        this.languageIndex++;
        await this.loadCurrentTranslation();
      } else {
        //as the last language is the default app one, this should never happen... Right ?
        this.translation = {};
      }
    }
  }
  /**
   * select DOM elements using data-translate key
   * translate each DOM element elected
   */
  translateDOM() {
    const elems = document.querySelectorAll("[data-translate]");
    for (let i = 0; i < elems.length; i++) {
      this.translateElement(elems[i]);
    }
  }

  /**
   * get the translation using data-translate value
   * replace DOM HTML with the translation
   */
  translateElement($el, values) {
    if ($el.dataset.translate) {
      $el.innerHTML = this.translate($el.dataset.translate, values);
    }
  }
  /**
   * @param key : string
   * @param values : object?
   * @returns string
   * using key to retrieve the wanted string in the translations
   * if values is a defined object, we use it to set value in the translation
   * ex: if values = { "hello" : "Hallo" } and translation = "{{hello}} Welt !"
   * returned text is "Hallo Welt !"
   */
  translate(key, values) {
    let text = this.translation[key];
    if (!text) {
      console.warn(`translation of ${key} not found`);
      text = key;
    }
    //I have to choose tags, so I'm using Mustache tags
    //I'm not adding the lib since it's not necessary
    //But if one day it is, the translation does not have to change :>
    if (typeof values === "object") {
      Object.keys(values).forEach((k) => {
        text = text.replaceAll(`{{${k}}}`, values[k]);
      });
    }
    return text;
  }

  /**
   * @param language : string
   * @returns string
   * return the short version of a language
   * ex: 'en-US' return 'en'
   */
  static getShortLanguage(language) {
    let shortLang = language;
    if (shortLang.indexOf("-") !== -1) {
      shortLang = shortLang.split("-")[0];
    }
    if (shortLang.indexOf("_") !== -1) {
      shortLang = shortLang.split("_")[0];
    }
    return shortLang;
  }

  /**
   * @param language : string
   * @returns JSON
   * fetch translation file and return its JSON content
   * throw error in case of file not found or invalid JSON content
   */
  static async fetchTranslation(language) {
    const response = await fetch(`assets/languages/${language}.json`);
    if (response.ok) {
      try {
        return await response.json();
      } catch (e) {
        WDebug.error("translation file is not a valid JSON: ", language);
        throw Error(`${language} translation file is not a valid JSON`);
      }
    } else {
      //Most likely a 404
      throw Error(`${language} not found`);
    }
  }
  /**
   * @returns string[]
   * get user's preferred languages
   * and add default translation app as the last one in case none of user's preferred languages are usable
   * ex ['ay', 'fr-FR', 'en-US', 'en']
   */
  static getAcceptedLanguages() {
    let languages = [...window.navigator.languages]; //use copy as window.navigator.languages is not editable
    languages.push(TranslationManager.DEFAULT); //add default language app as the last resort
    return languages;
  }
}
