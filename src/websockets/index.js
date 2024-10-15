import { WebSocketServer } from 'ws';
import { serverConfig } from '../config/index.js';
import { gmLog } from '../utils/logger.js';
import { getServerFromID } from '../classes/v3/Server.js';
import { getPanelUserFromDiscordID } from '../classes/v3/PanelUser.js';

let clients = {
  server: [],
  client: [],
};

const wss = new WebSocketServer({
  port: serverConfig.ports.websocket,
  clientTracking: true,
  verifyClient: async (info, cb) => {
    const { id, token } = info.req.headers;
    if (id && token) {
      const server = await getServerFromID(id);
      if (server && server.isValidToken(token)) {
        gmLog('websocket', 'Authorized server ' + id);
        return cb(true);
      }
    }

    if (
      info.req.url.includes('discordID') &&
      info.req.url.includes('token') &&
      info.req.url.includes('guildID') &&
      info.req.url.includes('serverID') &&
      info.req.url.includes('action')
    ) {
      const args = new URLSearchParams(info.req.url.split('?')[1].split('/').join('&'));
      const authToken = args.get('token');
      const discordID = args.get('discordID');
      const guildID = args.get('guildID');
      const serverID = args.get('serverID');
      const action = args.get('action');

      if (discordID && authToken && guildID && serverID && action) {
        const user = await getPanelUserFromDiscordID(discordID);
        if (user && (await user.authAllowed(authToken)) && (await user.isAdminOfGuild(guildID))) {
          const server = await getServerFromID(serverID);
          if (server && server.getGuildID() !== serverID) {
            gmLog('websocket', 'Authorized client ' + discordID);
            return cb(true);
          }
        }
      }
    }

    gmLog('websocket', 'Unauthorized connection');
    return cb(false, 401, 'Unauthorized');
  },
});

gmLog('websocket', 'Listening on port ' + serverConfig.ports.websocket);

wss.on('connection', function connection(ws, req) {
  const { id, token } = req.headers;

  if (id && token) {
    clients.server = clients.server.filter((client) => client.id !== id);
    clients.server.push({ id, ws });
    gmLog('websocket', 'Server connected: ' + id);
    ws.on('close', () => {
      clients.server = clients.server.filter((client) => client.id !== id);
      gmLog('websocket', 'Server disconnected: ' + id);
    });
  }

  if (
    req.url.includes('discordID') &&
    req.url.includes('token') &&
    req.url.includes('guildID') &&
    req.url.includes('serverID') &&
    req.url.includes('action')
  ) {
    const args = new URLSearchParams(req.url.split('?')[1].split('/').join('&'));
    const discordID = args.get('discordID');
    const barerToken = args.get('token');
    const guildID = args.get('guildID');
    const serverID = args.get('serverID');
    const action = args.get('action');

    if (discordID && barerToken && guildID && serverID && action) {
      clients.client = clients.client.filter((client) => client.discordID !== discordID);
      clients.client.push({ discordID, ws, guildID, serverID, action });
      gmLog('websocket', 'Client connected: ' + discordID);
      ws.on('close', () => {
        clients.client = clients.client.filter((client) => client.discordID !== discordID);
        gmLog('websocket', 'Client disconnected: ' + discordID);
      });
    }
  }

  setInterval(() => {
    ws.ping();
  }, 1000);
});

export function wsSendToServer(id, data) {
  const client = clients.server.find((client) => client.id === id);

  if (!client) {
    return false;
  }

  const stringData = JSON.stringify(data);

  console.log('Sending to server', id, stringData);
  client.ws.send(stringData);
  return true;
}

export function wsSendToClient(discordID, data, action) {
  const client = clients.client.find((client) => client.discordID === discordID && client.action === action);

  if (!client) {
    return false;
  }

  console.log('Sending to client', discordID);
  client.ws.send(JSON.stringify(data));
  return true;
}

export function wsSendToAllClientsOfServer(serverID, action, data) {
  // console.log('Sending to all clients of server', serverID);
  // console.log('Clients:', clients.client);
  const clientsToSend = clients.client.filter((client) => client.serverID === serverID && client.action === action);
  // console.log('Sending to', clientsToSend.length, 'clients', clientsToSend.join(', '));
  for (const client of clientsToSend) {
    console.log('Sending to client', client.discordID);
    client.ws.send(JSON.stringify(data));
  }

  return true;
}
