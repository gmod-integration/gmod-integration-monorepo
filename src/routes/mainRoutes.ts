import express, { Request, Response } from 'express';
import webhooksRoutes from './webhooks/_webhooksRoutes.js';
import v3Routes from './v3/_v3Routes.js';
import steamRoutes from './steamRoutes.js';
import fs from 'fs';
import asyncHandler from '../middleware/asyncHandler.js';
import prisma from '../prisma.js';

const router = express.Router();

router.use('/screenshots', express.static('screenshots'));
router.use(
  '/gdpr-request/:uuid',
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.query;
    let { uuid } = req.params;
    if (!code) return res.status(400).json({ error: 'missing_code' });

    const request = await prisma.gm_users_data_request.findFirst({
      where: {
        code: code as string,
        id: uuid,
        expirationDate: {
          gt: new Date(),
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
