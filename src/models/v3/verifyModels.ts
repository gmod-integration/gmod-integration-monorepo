import { getPanelUserFromDiscordID } from '../../classes/v3/PanelUser';
import { getTranslate } from '../../utils/localizations';
import { ActionRowBuilder, ButtonInteraction } from 'discord.js';
import { ButtonVerificationWebsite } from '../../discord/utils/buttons';
import { getUserFromDiscordID } from '../../classes/v3/User';
import { getVerifiedMessageAnswer } from '../../discord/utils/messages';
import { verifyUser } from './discordModels';
import prisma from '../../prisma';

export async function handleVerifyInteraction(interaction: ButtonInteraction) {
  if (!interaction.isButton()) return;
  if (interaction.user.bot) return;
  if (interaction.customId !== 'verify') return;
  if (!interaction.guild) {
    const panelUser = await getPanelUserFromDiscordID(interaction.user.id);
    const lang = 'en';

    if (
      !panelUser ||
      !panelUser.panelToken.creationDate ||
      new Date(panelUser.panelToken.creationDate) < new Date('2024-06-01')
    ) {
      return await interaction.reply({
        content: (await getTranslate('re_verify_yourself')) + '\n _ _',
        components: [new ActionRowBuilder().addComponents(await ButtonVerificationWebsite(lang))],
        ephemeral: true,
      });
    }

    const DBUser = await getUserFromDiscordID(interaction.user.id);
    if (!DBUser || !DBUser.getSteamID64()) {
      return await interaction.reply(await getVerifiedMessageAnswer(false, lang, interaction.user, true));
    }

    const guilds = await panelUser.findGuilds();
    let verifiedOf = [];
    for (const aGuild of guilds) {
      const dbGuild = await prisma.gm_guild.findFirst({
        where: {
          guild: aGuild.id,
        },
      });
      if (!dbGuild) continue;

      const guild = await interaction.client.guilds.fetch(aGuild.id).catch(() => null);
      if (!guild) continue;

      const user = await guild.members.fetch(interaction.user.id).catch(() => null);
      if (!user) continue;

      const isVerified = await verifyUser(guild, user);
      if (isVerified) verifiedOf.push(guild.name);
    }
    return await interaction.reply(`You have been verified in the following guilds: ${verifiedOf.join(', ')}`);
  } else {
    const guild = await interaction.client.guilds.fetch(interaction.guildId);
    const user = await guild.members.fetch(interaction.user.id).catch(() => null);
    const isVerified = await verifyUser(guild, user);
    return await interaction.reply(
      await getVerifiedMessageAnswer(isVerified, guild.preferredLocale, user, user.id === interaction.user.id),
    );
  }
}
