const BaseClass = require('./BaseClass');

class Angle extends BaseClass {
    constructor(obj = {}) {
        super();
        this.p = obj.p
        this.y = obj.y
        this.r = obj.r
    }
}

module.exports = Angle