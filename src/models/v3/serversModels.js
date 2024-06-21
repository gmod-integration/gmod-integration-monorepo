import gm_server from '../../database/schema/gm_server.js';

export async function getServerList(interaction, focusedOption, choices) {
  const guildServers = await gm_server.findAll({
    where: {
      guild: interaction.guildId,
    },
  });

  guildServers.forEach((server) => {
    choices[server.name] = server.id;
  });

  return Object.keys(choices).filter((choice) => choice.startsWith(focusedOption.value));
}
