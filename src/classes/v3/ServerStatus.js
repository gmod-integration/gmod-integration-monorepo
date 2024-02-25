const BaseClass = require("./BaseClass");

class ServerStatus extends BaseClass {
    constructor(obj = {}) {
        super();
        this.hostname = obj.hostname;
        this.ip = obj.ip;
        this.port = obj.port;
        this.map = obj.map;
        this.players = obj.players;
        this.maxPlayers = obj.maxPlayers;
        this.gameMode = obj.gameMode;
        this.uptime = obj.uptime;
    }
}

module.exports = {
    ServerStatus
}