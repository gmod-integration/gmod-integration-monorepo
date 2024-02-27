//
// Dependencies
//

const express = require('express');

const {port_api, bodyLimit} = require('./config');
const logger = require('./utils/logger');

//
// Express
//

const app = express();

// Set body size limit and parse JSON and URL-encoded bodies
app.use(express.json({limit: bodyLimit, type: 'application/json'}));
app.use(express.urlencoded({limit: bodyLimit, extended: true}));

// Proxy
app.set('trust proxy', true);

//
// Websocket
//

const ws = require('./websockets');

//
// Logger
//

const loggerMiddleware = require('./middleware/v3/loggers');
app.use(loggerMiddleware);

//
// Public Static
//

app.use('/screenshots', express.static('screenshots'));

//
// Webhooks
//

const webhooksRoutes = require('./routes/webhooks/_webhooksRoutes');
app.use('/webhooks', webhooksRoutes);

//
// Version Middleware
//

const versioningMiddleware = require('./middleware/v3/versioningMiddleware');
app.use(versioningMiddleware);

//
// Routes
//

const v2Routes = require('./routes/v2/_v2Routes');
app.use('/v2', v2Routes);

const v3Routes = require('./routes/v3/_v3Routes');
app.use('/v3', v3Routes);

//
// 404 Not Found
//

app.all('*', (req, res) => {
    return res.status(404).json({error: '404 Not Found'});
});

//
// Error Middleware
//

const errorMiddleware = require('./middleware/errorMiddleware');
app.use(errorMiddleware);

//
// Start Server
//
app.listen(port_api, () => logger.gmLog('system', `API listening on port ${port_api}`));