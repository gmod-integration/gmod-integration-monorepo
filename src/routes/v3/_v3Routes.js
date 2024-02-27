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

// Clients
const clientsRoutes = require('./clientsRoutes');
router.use('/clients', clientsRoutes);

// Players
const usersRoutes = require('./usersRoutes');
router.use('/users', usersRoutes);

module.exports = router;