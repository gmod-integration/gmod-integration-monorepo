import express from 'express';
import {isGlobalBanSomewhere} from '../../controllers/v3/bansControllers.js';

const router = express.Router();

router.get('/', isGlobalBanSomewhere);

export default router;