const BaseClass = require("./BaseClass");

class Position extends BaseClass {
    constructor(obj = {}) {
        super();
        this.x = obj.x;
        this.y = obj.y;
        this.z = obj.z;
    }
}

module.exports = Position;