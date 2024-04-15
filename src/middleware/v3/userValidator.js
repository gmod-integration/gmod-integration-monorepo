import {badArgument} from "../../utils/tools.js";
import {getPanelUserFromDiscordID} from "../../classes/v3/PanelUser.js";

export default async (req, res, next) => {
    const {discordID} = req.params;
    const {authorization} = req.headers;

    if (badArgument([discordID])) {
        return res.status(400).json({
            error: 'missing_arguments',
            args: {
                discordID: discordID
            }
        });
    }

    const token = authorization.split(' ')[1];

    const panelUser = await getPanelUserFromDiscordID(discordID);
    if (!panelUser) {
        return res.status(404).json({
            error: 'user_not_found'
        });
    }

    if (!panelUser.authAllowed(token)) {
        return res.status(401).json({
            error: 'unauthorized'
        });
    }

    req.panelUser = panelUser;
    next();
}