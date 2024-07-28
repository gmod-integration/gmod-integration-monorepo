import { handlePremiumInteraction } from '../../classes/v3/Guild.js';
import { handleWarnInteraction } from '../../models/v3/warnModels.js';
import { handleVerifyInteraction } from '../../models/v3/verifyModels.js';
import { handleLeaderboardInteraction } from '../../models/v3/leaderboardModels.js';

export default {
  name: 'interactionCreate',
  async execute(interaction) {
    await handleWarnInteraction(interaction);
    await handleVerifyInteraction(interaction);
    await handleLeaderboardInteraction(interaction);
    await handlePremiumInteraction(interaction);
  },
};
