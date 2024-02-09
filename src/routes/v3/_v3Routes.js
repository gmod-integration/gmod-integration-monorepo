const express = require('express');
const router = express.Router();

// Check API Version
router.get('/', (req, res) => {
    res.json({status: 'ok', version: 'v3'});
});

// Servers
const serversRoutes = require('./serversRoutes');
router.use('/servers', serversRoutes);

// Bans
const bansRoutes = require('./bansRoutes');
router.use('/bans', bansRoutes);

// Players
const playersRoutes = require('./playersRoutes');
router.use('/players', playersRoutes);

module.exports = router;