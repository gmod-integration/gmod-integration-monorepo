import {gmLog} from '../../utils/logger.js';

export default (req, res, next) => {
    const method = req.method;
    const url = req.url;
    const ip = req.headers['cf-connecting-ip'] || req.ip;
    const id = url.split('/')[2];
    const query = JSON.stringify(req.query);

    let body = JSON.stringify(req.body);
    if (url.includes('screenshots') || url.includes('streams')) {
        body = 'HIDDEN';
    }

    gmLog('api', `Method: ${method} URL: ${url} IP: ${ip} Server ID: ${id} Body: ${body} Query: ${query}`);

    next();
}