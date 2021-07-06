"use strict";
// var timeStamp = new Date().toISOString();

export class Logger {
    private module: string;

    constructor(module: string) {
        this.module = module;
    }

    public error(text: string) {
        console.error(`[${this.module}] ${text}`);
    }

    public warn(text: string) {
        console.warn(`[${this.module}] ${text}`);
    }

    public log(text: string) {
        console.log(`[${this.module}] ${text}`);
    }

    public info(text: string) {
        console.log(`[${this.module}] ${text}`);
    }

    public verbose(text: string) {
        console.debug(`[${this.module}] ${text}`);
    }

    public dump(text: string, obj: object) {
        console.log(`[${this.module}] ${text} ${JSON.stringify(obj, undefined, 2)}`);
    }
}