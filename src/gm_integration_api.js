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

// Proxy
app.set('trust proxy', true);

// Body Parser
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Loger
app.use((req, res, next) => {
    const method = req.method;
    const url = req.url;
    const ip = req.headers['cf-connecting-ip'] || req.ip;
    const body = JSON.stringify(req.body);
    const query = JSON.stringify(req.query);
    const id = req.headers['id'] || 'unknown';
    logger.gmLog('api', `Request: ${method} ${url} from ${ip} with body ${body} and query ${query} and server id ${id}`);
    next();
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