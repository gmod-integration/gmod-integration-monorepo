import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';
import { verifyUser } from '../../../models/v3/discordModels.js';

export default {
  data: new ContextMenuCommandBuilder()
    .setName('Verify')
    .setType(ApplicationCommandType.User)
    .setDMPermission(false)
    .setDefaultMemberPermissions(0),
  category: 'admin',
  async execute(interaction) {
    const isVerified = await verifyUser(interaction.guild, interaction.user);
    if (isVerified) {
      await interaction.reply({ content: 'You are now verified!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'You are already verified!', ephemeral: true });
    }
  },
};
