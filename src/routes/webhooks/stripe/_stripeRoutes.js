const express = require('express');
const gmodStoreControllers = require("../../../controllers/webhooks/gmodstoreControllers");
const router = express.Router();
router.post('/', async (req, res) => {
    const event = req.body.type;

    switch (event) {
        case 'checkout.session.completed':
            console.log('checkout.session.completed');
            // get invoice url
            const invoiceUrl = req.body.data.object.invoice_pdf;
            console.log(invoiceUrl);
            break;
        default:
            return res.status(400).json({error: 'invalid_event'});
    }

    return res.status(200).json({message: 'success'});
});

module.exports = router;