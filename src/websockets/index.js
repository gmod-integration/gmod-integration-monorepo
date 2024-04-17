import { WebSocketServer } from 'ws';
import { serverConfig } from '../config/index.js';
import { gmLog } from '../utils/logger.js';
import { getServerFromID } from '../classes/v3/Server.js';

const wss = new WebSocketServer({
  port: serverConfig.ports.websocket,
  clientTracking: true,
  verifyClient: async (info, cb) => {
    const { id, token } = info.req.headers;

    if (!id || !token) {
      gmLog('websocket', 'Missing id or token');
      return cb(false, 401, 'Unauthorized');
    }

    const server = await getServerFromID(id);
    if (!server) {
      gmLog('websocket', 'Server not found ' + id);
      return cb(false, 401, 'Unauthorized');
    }

    if (!server.isValidToken(token)) {
      gmLog('websocket', 'Invalid token for server ' + id);
      return cb(false, 401, 'Unauthorized');
    }

    gmLog('websocket', 'Authorized client ' + id);
    return cb(true);
  },
});

gmLog('websocket', 'Listening on port ' + serverConfig.ports.websocket);

let clients = [];

wss.on('connection', function connection(ws, req) {
  const { id, token } = req.headers;

  gmLog('websocket', 'Client connected ' + id);
  clients = clients.filter((client) => client.id !== id);
  clients.push({ id: id, ws: ws });

  ws.on('close', () => {
    gmLog('websocket', 'Client disconnected ' + id);
    clients = clients.filter((client) => client.id !== id);
  });

  // stay alive
  setInterval(() => {
    ws.ping();
  }, 10000);
});

export function wsSendToServer(id, data) {
  let success = false;
  clients.forEach((client) => {
    if (client.id === id) {
      client.ws.send(JSON.stringify(data));
      success = true;
    }
  });

  if (!success) {
    gmLog('websocket', 'Client ' + id + ' not found');
  } else {
    gmLog('websocket', 'Sent to client ' + id + ': ' + JSON.stringify(data));
  }
  return success;
}