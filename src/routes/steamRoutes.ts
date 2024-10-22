import express from 'express';
import { steamVerification, steamVerificationReturn } from '../controllers/v3/steamControllers';

const router = express.Router();

router.get('/', steamVerification);
router.get('/return', steamVerificationReturn);

export default router;
