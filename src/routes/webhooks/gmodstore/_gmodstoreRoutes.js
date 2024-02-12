const express = require('express');
const router = express.Router();
const gmodStoreControllers = require('../../../controllers/webhooks/gmodstoreControllers');

router.post('/', async (req, res) => {
    const event = req.body.eventType;

    if (!event) return res.status(400).json({error: 'missing_arguments'});

    if (event === 'product_purchase.created' || event === 'product_purchase.unrevoked') {
        await gmodStoreControllers.purchase(req, res);
    } else if (event === 'product_purchase.revoked') {
        await gmodStoreControllers.revoke(req, res);
    } else {
        res.status(400).json({error: 'invalid_event'});
    }
});

module.exports = router;