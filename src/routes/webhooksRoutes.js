const express = require('express');
const router = express.Router();

const gmodStore = require('../controllers/gmodstoreController');
const gmodStoreValidatorMiddleware = require('../middleware/gmodstoreValidator');
router.post('/gms', gmodStoreValidatorMiddleware, gmodStore.subRoute);

const stripe = require('../controllers/stripeController');
const stripeValidatorMiddleware = require('../middleware/stripeValidator');
router.post('/stripe', stripeValidatorMiddleware, stripe.subRoute);

module.exports = router;