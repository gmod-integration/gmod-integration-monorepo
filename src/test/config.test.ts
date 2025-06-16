import prisma from '../services/prisma/index.js';
import { ConfigServer } from '../classes/config/Config.js';

const testConfig = {
  server: {
    id: '3dWQ1LTknE',
    token: 'QEFHAqTHZSHB7xY4',
  },
  user: {
    discordID: '333650866747867137',
    steamID: '76561198219049673',
    token: '<token>',
  },
  guild: {
    id: '1299172406169960458',
  },
};

const userToken = await prisma.gm_panelToken.findFirst({
  where: {
    discordID: testConfig.user.discordID,
  },
  orderBy: {
    createdAt: 'desc',
  },
});

testConfig.user.token = userToken?.accessToken || '';

export function getTestUri(path: string): string {
  // remplace :discordID by testConfig.discordID
  path = path.replace(/:discordID/g, testConfig.user.discordID);
  // remplace :steamID by testConfig.steamID64
  path = path.replace(/:steamID64/g, testConfig.user.steamID);
  // remplace :serverID by testConfig.serverID
  path = path.replace(/:serverID/g, testConfig.server.id);
  // remplace :guildID by testConfig.guildID
  path = path.replace(/:guildID/g, testConfig.guild.id);

  return `http://localhost:${ConfigServer.ports.api}${path}`;
}

export default testConfig;
