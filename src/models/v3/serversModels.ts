import { AutocompleteFocusedOption, AutocompleteInteraction } from 'discord.js';
import prisma from '../../prisma.js';

export async function getServerList(
  interaction: AutocompleteInteraction,
  focusedOption: AutocompleteFocusedOption,
  choices: {
    [key: string]: string;
  },
) {
  if (!interaction.guildId) {
    return [];
  }

  const guildServers = await prisma.gm_server.findMany({
    where: {
      guild: interaction.guildId,
    },
  });

  guildServers.forEach((server) => {
    choices[server.name] = server.id;
  });

  return Object.keys(choices).filter((choice) => choice.startsWith(focusedOption.value));
}
