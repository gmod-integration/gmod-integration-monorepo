import express, { Request, Response } from 'express';
import serversRoutes from './serversRoutes';
import bansRoutes from './bansRoutes';
import clientsRoutes from './clientsRoutes';
import usersRoutes from './usersRoutes';
import mainRoutes from './mainRoutes';

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
