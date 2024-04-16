import { replyNeedPremium } from '../../classes/v3/Guild.js';

export default {
  name: 'interactionCreate',
  execute(interaction) {
    if (interaction.guild && interaction.isButton()) {
      if (interaction.customId === 'premium') {
        return replyNeedPremium(interaction);
      }
    }
  },
};
