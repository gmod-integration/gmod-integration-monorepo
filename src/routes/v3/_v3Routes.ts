import express, { Request, Response } from 'express';
import serversRoutes from './serversRoutes.js';
import bansRoutes from './bansRoutes.js';
import clientsRoutes from './clientsRoutes.js';
import usersRoutes from './usersRoutes.js';
import mainRoutes from './mainRoutes.js';

const router = express.Router();

router.get('/', (req: Request, res: Response) => {
  res.json({ status: 'ok', version: 'v3' });
});

router.use('/servers', serversRoutes);
router.use('/bans', bansRoutes);
router.use('/clients', clientsRoutes);
router.use('/users', usersRoutes);
router.use('/', mainRoutes);

export default router;
