import { serverConfig } from '../config/index.js';

export function gmLog(type, message, debug) {
  if (!serverConfig.debug && debug) {
    return;
  }
  console.log(`[${new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')}] [${type.toUpperCase()}] ${message}`);
}
