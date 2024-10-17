import { serverConfig } from '../config';

export function gmLog(type: string, message: string, debug: boolean = false) {
  if (!serverConfig.debug && debug) {
    return;
  }
  console.log(`[${new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')}] [${type.toUpperCase()}] ${message}`);
}
