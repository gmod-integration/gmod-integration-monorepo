const express = require('express');
const router = express.Router();

const gmodStoreValidatorMiddleware = require('../../middleware/webhooks/gmodstoreValidator');
const gmodStoreRoutes = require('./gmodstore/_gmodstoreRoutes');
router.use('/gmod-store', gmodStoreValidatorMiddleware, gmodStoreRoutes);

const stripeValidatorMiddleware = require('../../middleware/webhooks/stripeValidator');
const stripeRoutes = require('./stripe/_stripeRoutes');
router.use('/stripe', stripeValidatorMiddleware, stripeRoutes);

module.exports = router;