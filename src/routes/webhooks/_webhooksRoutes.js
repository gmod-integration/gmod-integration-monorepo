const express = require('express');
const router = express.Router();

const gmodStoreValidatorMiddleware = require('../../middleware/webhooks/gmodStoreValidator');
const gmodStoreRoutes = require('./gmodstore/_gmodStoreRoutes');
router.use('/gmod-store', gmodStoreValidatorMiddleware, gmodStoreRoutes);

const stripeValidatorMiddleware = require('../../middleware/webhooks/stripeValidator');
const stripeRoutes = require('./stripe/_stripeRoutes');
router.use('/stripe', stripeValidatorMiddleware, stripeRoutes);

module.exports = router;