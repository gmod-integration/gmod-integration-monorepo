import { Request, Response } from 'express';
import index from '../../services/prisma/index.js';

export async function getAllPanelUsers(req: Request, res: Response) {
  const users = await index.gm_panelToken.findMany({
    where: {
      expirationDate: {
        gt: new Date(),
      },
    },
  });
  return res.status(200).json(users);
}
