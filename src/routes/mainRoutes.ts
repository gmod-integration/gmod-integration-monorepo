import express from 'express';
import webhooksRoutes from './webhooks/_webhooksRoutes.js';
import v3Routes from './v3/_v3Routes.js';
import steamRoutes from './steamRoutes.js';
import asyncHandler from '../middleware/asyncHandler.js';
import prisma from '../services/prisma/index.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3 } from '../services/minio/index.js';
import { Readable } from 'node:stream';

const router = express.Router();

router.get('/screenshots/:filename', async (req, res) => {
  const filename = req.params.filename;

  try {
    const command = new GetObjectCommand({
      Bucket: 'gmi-players-screenshots',
      Key: filename,
    });

    const response = await s3.send(command);

    res.setHeader('Content-Type', response.ContentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200);

    if (response.Body instanceof Readable) {
      response.Body.pipe(res);
    } else {
      res.end('Error: no stream returned');
    }
  } catch (err) {
    console.error('Error generating signed URL for screenshot:', err);
    res.status(404).send('Screenshot not found');
  }
});

router.get(
  '/gdpr-request/:uuid',
  asyncHandler(async (req, res) => {
    const { code } = req.query;
    const { uuid } = req.params;

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

    try {
      const command = new GetObjectCommand({
        Bucket: 'gmi-gdpr-exports',
        Key: `${uuid}.zip`,
      });

      const response = await s3.send(command);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${uuid}.zip"`);
      res.status(200);

      if (response.Body instanceof Readable) {
        response.Body.pipe(res);
      } else {
        res.end('Error: no stream returned');
      }
    } catch (err) {
      console.error('Error downloading GDPR ZIP from S3:', err);
      return res.status(404).json({ error: 'invalid_uuid' });
    }
  }),
);

router.use('/webhooks', webhooksRoutes);
router.use('/v3', v3Routes);
router.use('/steam', steamRoutes);

export default router;
