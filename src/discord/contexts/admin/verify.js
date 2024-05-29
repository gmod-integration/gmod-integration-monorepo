import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';
import { verifyUser } from '../../../models/v3/discordModels.js';
import { getVerifiedMessageAnswer } from '../../utils/messages.js';
import { getTranslate } from '../../../utils/localizations.js';

export default {
  data: new ContextMenuCommandBuilder()
    .setName('Verify')
    .setType(ApplicationCommandType.User)
    .setDMPermission(false)
    .setDefaultMemberPermissions(0),
  category: 'admin',
  async execute(interaction) {
    const guild = await interaction.client.guilds.fetch(interaction.guildId);
    const user = await guild.members.fetch(interaction.targetId).catch(() => null);

    if (!user) return interaction.reply(await getTranslate('something_went_wrong', guild.preferredLocale));

    const isVerified = await verifyUser(guild, user);
    await interaction.reply(await getVerifiedMessageAnswer(isVerified, guild, user, user.id === interaction.user.id));
  },
};
