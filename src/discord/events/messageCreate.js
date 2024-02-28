const guildsControllers = require('../../controllers/v3/guildsControllers');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        await guildsControllers.sendMessageToGmod(message);
    }
};