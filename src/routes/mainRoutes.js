import express from 'express';
import statusMonitor from 'express-status-monitor';
import webhooksRoutes from './webhooks/_webhooksRoutes.js';
import v3Routes from './v3/_v3Routes.js';
import steamRoutes from './steamRoutes.js';
import fs from 'fs';
import UsersDataRequest from '../database/schema/UsersDataRequest.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { Op } from 'sequelize';

const router = express.Router();

router.use(statusMonitor());
router.use('/screenshots', express.static('screenshots'));
router.use(
  '/gdpr-request/:uuid',
  asyncHandler(async (req, res) => {
    const { code } = req.query;
    let { uuid } = req.params;
    if (!code) return res.status(400).json({ error: 'missing_code' });

    const request = await UsersDataRequest.findOne({
      where: {
        code,
        id: uuid,
        expirationDate: {
          [Op.gte]: new Date(),
        },
      },
    });

    if (!request) return res.status(404).json({ error: 'invalid_code' });

    if (!fs.existsSync(`./gdpr-request/${uuid}.zip`)) {
      return res.status(404).json({ error: 'invalid_uuid' });
    } else {
      return res.status(200).download(`./gdpr-request/${uuid}.zip`);
    }
  }),
);
router.use('/webhooks', webhooksRoutes);
router.use('/v3', v3Routes);
router.use('/steam', steamRoutes);

export default router;
