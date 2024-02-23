class BaseClass {
    isValid() {
        const keys = Object.keys(this);
        for (const key of keys) {
            if (this[key] instanceof Object) {
                if (!this[key].isValid()) {
                    return false;
                }
            } else {
                if (!this[key] || this[key] === "" || this[key] === null || this[key] === undefined) {
                    return false;
                }
            }
        }
        return true;
    }

    isValidGetInformations() {
        const keys = Object.keys(this);
        const result = {};
        for (const key of keys) {
            if (this[key] instanceof Object) {
                result[key] = this[key].isValidGetInformations();
            } else {
                result[key] = !!this[key];
            }
        }
        return result;
    }
}

module.exports = BaseClass;