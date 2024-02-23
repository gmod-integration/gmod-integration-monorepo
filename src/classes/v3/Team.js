const BaseClass = require("./BaseClass");
const {badArgument} = require("../../utils/tools");

class Team extends BaseClass {
    constructor(obj = {}) {
        super();
        this.id = obj.id
        this.name = obj.name
    }
}

module.exports = Team;