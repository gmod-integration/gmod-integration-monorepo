//
// Dependencies
//

const express = require('express');
const bodyParser = require('body-parser');

const config = require('./config');
const logger = require('./utils/logger');

const rateLimiterMiddleware = require('./middleware/rateLimiter');
const userAgentMiddleware = require('./middleware/userAgentValidator');
const authValidatorMiddleware = require('./middleware/authValidator');

const serverRoutes = require('./routes/serverRoutes');
const userRoutes = require('./routes/userRoutes');

//
// Express
//

const app = express();

// Loger
app.use((req, res, next) => {
    logger.gmLog('http', `${req.method} ${req.url}`);
    next();
});

//
// Middleware
//

// Rate Limiter
app.use(rateLimiterMiddleware);

// Body Parser
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

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