import prisma from '../prisma';

const testConfig = {
  server: {
    id: '',
    token: '',
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

testConfig.user.token = 'Bearer ' + userToken?.accessToken || '';

export default testConfig;
