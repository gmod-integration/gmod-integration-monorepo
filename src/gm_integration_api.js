//
// Dependencies
//

const express = require('express');
const bodyParser = require('body-parser');

const config = require('./config');
const logger = require('./utils/logger');

const gmodstoreValidatorMiddleware = require('./middleware/gmodstoreValidator');
const userAgentMiddleware = require('./middleware/userAgentValidator');
const authValidatorMiddleware = require('./middleware/authValidator');
const playerValidatorMiddleware = require('./middleware/playerValidator');

const serverRoutes = require('./routes/serverRoutes');
const userRoutes = require('./routes/userRoutes');
const playerRoutes = require('./routes/playerRoutes');
const gmodstoreRoutes = require('./routes/gmodstoreRoutes');
const crypto = require("crypto");

//
// Express
//

const app = express();

// express max body content = 10mb
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({limit: '10mb', extended: true}));

//
// Middleware
//

// Proxy
app.set('trust proxy', true);

// Body Parser
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

// API Status route
app.get('/', (req, res) => {
    res.json({status: 'ok'});
});

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        logger.gmLog('api', 'Request #' + req.requestID + ' Bad Request: Invalid JSON');
        return res.status(400).send('Bad Request: Invalid JSON');
    }
    next(err);
});

// public screenshots
app.use('/screenshots', express.static('screenshots'));

app.use('/webhooks/gms', gmodstoreValidatorMiddleware);
app.use('/webhooks/gms', gmodstoreRoutes);

// Auth Validator
app.use(userAgentMiddleware);

// Logger
app.use((req, res, next) => {
    const method = req.method;
    const url = req.url;
    const ip = req.headers['cf-connecting-ip'] || req.ip;
    let body = JSON.stringify(req.body);
    if (url.includes('screenshots')) {
        body = '[REDACTED]';
    }
    const query = JSON.stringify(req.query);
    const id = req.headers['id'] || 'unknown';
    const version = req.headers['version'] || 'unknown';
    logger.gmLog('api', ' Method: ' + method + ' URL: ' + url + ' IP: ' + ip + ' Version: ' + version + ' Server ID: ' + id + ' Body: ' + body + ' Query: ' + query);
    next();
});

//
// Routes
//

app.use('/server', authValidatorMiddleware);
app.use('/user', authValidatorMiddleware);
app.use('/server', serverRoutes);
app.use('/user', userRoutes);

app.use('/player', playerValidatorMiddleware);
app.use('/player', playerRoutes);

//
// Redirects
//

app.all('*', (req, res) => {
    res.status(404).json({error: '404 Not Found'});
});

//
// Server
//

const port = config.port_api;
app.listen(port, () => logger.gmLog('system', `API listening on port ${port}`));