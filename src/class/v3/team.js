const {badArgument} = require("../../utils/tools");

class Team {
    constructor(id, name) {
        this.id = id;
        this.name = name;
    }

    isValid() {
        return !badArgument([this.id, this.name]);
    }

    static fromObject(obj) {
        return new Team(obj.id, obj.name);
    }

    toObject() {
        return {
            id: this.id,
            name: this.name
        };
    }
}

module.exports = {
    Team
}