const BaseClass = require("./BaseClass");

class Team extends BaseClass {
    constructor(obj = {}) {
        super();
        this.id = obj.id
        this.name = obj.name
    }
}

module.exports = Team;