import { handlePremiumInteraction } from '@gmod/domain-guild/Guild.js';
import { handleWarnInteraction } from '@gmod/domain-moderation/warnModels.js';
import { handleVerifyInteraction } from '@gmod/domain-guild/verifyModels.js';
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
