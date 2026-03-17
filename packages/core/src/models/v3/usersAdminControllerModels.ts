import prisma from '@gmod/infra-prisma';

export async function getAllActivePanelUsers() {
  return await prisma.gm_panelToken.findMany({
    where: {
      expirationDate: {
        gt: new Date(),
      },
    },
  });
}
