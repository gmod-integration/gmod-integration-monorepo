import express from 'express';
import {getProfile} from '../../controllers/v3/usersControllers.js';

const router = express.Router();

router.get('/', getProfile);

export default router;