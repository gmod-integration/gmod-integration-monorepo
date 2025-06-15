import { Request, Response } from 'express';
import prisma from '../../services/prisma/prisma.js';

export async function getAllPanelUsers(req: Request, res: Response) {
  const users = await prisma.gm_panelToken.findMany({
    where: {
      expirationDate: {
        gt: new Date(),
      },
    },
  });
  return res.status(200).json(users);
}
