const express = require('express');
const router = express.Router();

// Check API Version
router.get('/', (req, res) => {
    res.json({status: 'ok', version: 'v2'});
});

// Players
const playerRoutes = require('./playerRoutes');
router.use('/player', playerRoutes);

// Servers
const serverRoutes = require('./serverRoutes');
router.use('/server', serverRoutes);

// User
const userRoutes = require('./userRoutes');
router.use('/user', userRoutes);

module.exports = router;