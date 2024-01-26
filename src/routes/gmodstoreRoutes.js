const express = require('express');
const router = express.Router();
const gmodStore = require('../controllers/gmodstoreController');

router.post('/', gmodStore.subRoute);

module.exports = router;