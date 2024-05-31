import express from 'express';
import statusMonitor from 'express-status-monitor';
import webhooksRoutes from './webhooks/_webhooksRoutes.js';
import v3Routes from './v3/_v3Routes.js';
import steamRoutes from './steamRoutes.js';

const router = express.Router();

router.use(statusMonitor());
router.use('/screenshots', express.static('screenshots'));
router.use('/webhooks', webhooksRoutes);
router.use('/v3', v3Routes);
router.use('/steam', steamRoutes);

export default router;
