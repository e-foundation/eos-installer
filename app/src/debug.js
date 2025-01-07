export class WDebug {
  constructor() {}

  static log(...args) {
    console.log("[DEBUG]", ...args);
  }
  static error(...args) {
    console.error("[ERROR]", ...args);
  }
}
