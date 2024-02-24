const BaseClass = require("./BaseClass");

class CustomValues extends BaseClass {
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

module.exports = CustomValues;