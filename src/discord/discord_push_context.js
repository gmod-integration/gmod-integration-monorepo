import { ApplicationCommandType, ContextMenuCommandBuilder, REST, Routes } from 'discord.js';
import { discordConfig } from '../config/index.js';

const commandsData = [new ContextMenuCommandBuilder().setName('Show Profile').setType(ApplicationCommandType.USER)];

const rest = new REST().setToken(discordConfig.botToken);
try {
  console.log('Started refreshing application.');

  await rest.put(Routes.applicationCommands(discordConfig.clientID), {
    body: commandsData,
  });

  console.log('Successfully reloaded application.');
} catch (error) {
  console.error(error);
}
