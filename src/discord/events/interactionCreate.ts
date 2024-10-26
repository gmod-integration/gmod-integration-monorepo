import { handlePremiumInteraction } from '../../classes/v3/Guild.js';
import { handleWarnInteraction } from '../../models/v3/warnModels.js';
import { handleVerifyInteraction } from '../../models/v3/verifyModels.js';
import { handleLeaderboardInteraction } from '../../models/v3/leaderboardModels.js';
import { ButtonInteraction, Interaction } from 'discord.js';

export default {
  name: 'interactionCreate',
  async execute(interaction: Interaction | ButtonInteraction) {
    if (interaction.isButton()) {
      await handleVerifyInteraction(interaction);
      await handleWarnInteraction(interaction);
      await handleLeaderboardInteraction(interaction);
      await handlePremiumInteraction(interaction);
    }
  },
};
