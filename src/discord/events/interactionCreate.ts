import { handlePremiumInteraction } from '../../classes/v3/Guild';
import { handleWarnInteraction } from '../../models/v3/warnModels';
import { handleVerifyInteraction } from '../../models/v3/verifyModels';
import { handleLeaderboardInteraction } from '../../models/v3/leaderboardModels';
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
