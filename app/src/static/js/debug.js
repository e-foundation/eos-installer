export class WDebug {
    constructor() {}
    
    static log(...args) {
      console.log('[DEBUG]', ...args);
    }
  }