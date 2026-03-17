import { Request, Response } from 'express';
import { getAllActivePanelUsers } from '@gmod/core/models/v3/usersAdminControllerModels.js';

export async function getAllPanelUsers(req: Request, res: Response) {
  const users = await getAllActivePanelUsers();
  return res.status(200).json(users);
}
