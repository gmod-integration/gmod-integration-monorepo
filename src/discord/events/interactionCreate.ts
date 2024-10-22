import { handlePremiumInteraction } from '../../classes/v3/Guild.js';
import { handleWarnInteraction } from '../../models/v3/warnModels';
import { handleVerifyInteraction } from '../../models/v3/verifyModels.js';
import { handleLeaderboardInteraction } from '../../models/v3/leaderboardModels.js';
import { Interaction } from 'discord.js';

export default {
  name: 'interactionCreate',
  async execute(interaction: Interaction) {
    await handleWarnInteraction(interaction);
    await handleVerifyInteraction(interaction);
    await handleLeaderboardInteraction(interaction);
    await handlePremiumInteraction(interaction);
  },
};
