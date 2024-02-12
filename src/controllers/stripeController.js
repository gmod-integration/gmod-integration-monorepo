async function subRoute(req, res) {
    const event = req.body.type;
    const stripeEvent = req.stripeEvent;
    console.log(event, stripeEvent)

    if (!event) return res.status(400).json({error: 'missing_arguments'});

    if (event === 'checkout.session.completed') {
        console.log(stripeEvent);
        console.log("discordID" + stripeEvent.data.object.metadata ? stripeEvent.data.object.metadata.discordID : "none");
    } else {
        console.log('event not handle')
        console.log(event)
        res.json({status: 'ok'});
    }
}

module.exports = {
    subRoute,
}