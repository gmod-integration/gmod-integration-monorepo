module.exports = {
    name: 'interactionCreate',
    execute(interaction) {
        if (interaction.guild && interaction.isButton()) {
            if (interaction.customId === 'premium') {
                return replyNeedPremium(interaction);
            }
        }
    }
};