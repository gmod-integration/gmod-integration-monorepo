//
// Dependencies
//

const express = require('express');
const bodyParser = require('body-parser');

const config = require('./config');
const logger = require('./utils/logger');

const userAgentMiddleware = require('./middleware/userAgentValidator');
const authValidatorMiddleware = require('./middleware/authValidator');

const serverRoutes = require('./routes/serverRoutes');
const userRoutes = require('./routes/userRoutes');

//
// Express
//

const app = express();


//
// Middleware
//

// ID
let requestID = "0000"
app.use((req, res, next) => {
    // base hexadecimal to encode requestID (unique for each request) limit to 4 characters / reboot
    if (requestID === "ffff") {
        requestID = 0;
    } else {
        requestID++;
    }
    req.requestID = requestID.toString(16).padStart(4, '0');
    next();
});

// Proxy
app.set('trust proxy', true);

// Body Parser
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Loger
let requestIDGlobal = 0;
app.use((req, res, next) => {
    const reqID = req.requestID;
    const method = req.method;
    const url = req.url;
    const ip = req.headers['cf-connecting-ip'] || req.ip;
    const body = JSON.stringify(req.body);
    const query = JSON.stringify(req.query);
    const id = req.headers['id'] || 'unknown';
    logger.gmLog('api', 'Request #' + reqID + ' Method: ' + method + ' URL: ' + url + ' IP: ' + ip + ' ID: ' + id + ' Body: ' + body + ' Query: ' + query);
    next();
});

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        logger.gmLog('api', 'Request #' + req.requestID + ' Bad Request: Invalid JSON');
        return res.status(400).send('Bad Request: Invalid JSON');
    }
    next(err);
});

// Auth Validator
app.use(userAgentMiddleware, authValidatorMiddleware);

//
// Routes
//

app.use('/server', serverRoutes);
app.use('/user', userRoutes);

//
// Redirects
//

app.all('*', (req, res) => {
    res.status(404).json({ error: '404 Not Found' });
});

//
// Server
//

const port = config.port_api;
app.listen(port, () => logger.gmLog('system', `API listening on port ${port}`));