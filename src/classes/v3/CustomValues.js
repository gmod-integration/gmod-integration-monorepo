import {BaseClass} from "./BaseClass.js";

export class CustomValues extends BaseClass {
    constructor(obj = {}) {
        super();
        const keys = Object.keys(obj);
        for (const key of keys) {
            this[key] = obj[key];
        }
    }

    isValid() {
        return true;
    }
}