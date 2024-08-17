import { gmLog } from '../../utils/logger.js';

export default (req, res, next) => {
  const method = req.method;
  const url = req.url;
  const ip = req.headers['cf-connecting-ip'] || req.ip;
  const id = url.split('/')[2];
  const query = JSON.stringify(req.query);

  const cpBody = structuredClone(req.body);

  if (url.endsWith('/bugs') && cpBody.screenshot && cpBody.screenshot.screenshot) {
    cpBody.screenshot.screenshot = '[IMAGE]';
  } else if (url.endsWith('/screenshot') && cpBody.screenshot) {
    cpBody.screenshot = '[IMAGE]';
  }

  gmLog(
    'api',
    `Method: ${method} URL: ${url} IP: ${ip} Server ID: ${id} Body: ${JSON.stringify(cpBody)} Query: ${query}`,
  );

  next();
};
