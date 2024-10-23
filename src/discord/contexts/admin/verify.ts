import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  ContextMenuCommandInteraction,
  ContextMenuCommandType,
  InteractionContextType,
} from 'discord.js';
import { verifyUser } from '../../../models/v3/discordModels';
import { getVerifiedMessageAnswer } from '../../utils/messages';
import { getTranslate } from '../../../utils/localizations';

export default {
  data: new ContextMenuCommandBuilder()
    .setName('Verify')
    .setContexts([InteractionContextType.Guild])
    .setType(ApplicationCommandType.User as ContextMenuCommandType)
    .setDefaultMemberPermissions(0),
  category: 'admin',
  async execute(interaction: ContextMenuCommandInteraction) {
    if (!interaction.guild) return interaction.reply('Something went wrong!');

    const user = await interaction.guild.members.fetch(interaction.targetId).catch(() => null);

    if (!user) return interaction.reply(await getTranslate('something_went_wrong', interaction.guild.preferredLocale));

    const isVerified = await verifyUser(interaction.guild, user);
    await interaction.reply(
      await getVerifiedMessageAnswer(
        isVerified,
        interaction.guild.preferredLocale,
        user.user,
        user.id === interaction.user.id,
      ),
    );
  },
};
