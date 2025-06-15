import { WebSocketServer } from 'ws';
import { serverConfig } from '../config/index.js';
import { gmLog } from '../utils/logger.js';
import { getServerFromID, getServersFromDiscordGuildID } from '../classes/v3/Server.js';
import { getPanelUserFromDiscordID, PanelUser } from '../classes/v3/PanelUser.js';
import redis from '../services/redis/index.js';
import { lastGmodIntegrationTag, versionComparator } from '../utils/tools.js';

interface wsClientClient {
  ws: any;
  panelUser: PanelUser;
  guildAdminListID: string[];
  serverAdminListID: string[];
}

interface wsClientServer {
  id: string;
  ws: any;
}

let clients = {
  server: [] as wsClientServer[],
  client: [] as wsClientClient[],
};

const wss = new WebSocketServer({
  port: serverConfig.ports.websocket,
  clientTracking: true,
  verifyClient: async (info, cb) => {
    const { id, token } = info.req.headers;

    if (id && token) {
      const server = await getServerFromID(id as string);
      if (server && server.isValidToken(token as string)) {
        gmLog('websocket', 'Authorized server ' + id);
        return cb(true);
      }
    }

    if (info.req.url && info.req.url.includes('discordID') && info.req.url.includes('token')) {
      const args = new URLSearchParams(info.req.url.split('?')[1].split('/').join('&'));
      const authToken = args.get('token');
      const discordID = args.get('discordID');

      if (discordID && authToken) {
        const user = await getPanelUserFromDiscordID(discordID);
        if (user && (await user.authAllowed(authToken))) {
          gmLog('websocket', 'Authorized client ' + discordID);
          return cb(true);
        }
      }
    }

    gmLog('websocket', 'Unauthorized connection');

    return cb(false, 401, 'Unauthorized');
  },
});

wss.on('connection', async function connection(ws, req) {
  const { id, token } = req.headers;

  if (id && token) {
    clients.server = clients.server.filter((client) => client.id !== id);
    clients.server.push({ id: id.toString(), ws });
    gmLog('websocket', 'Server connected: ' + id);
    ws.on('close', () => {
      clients.server = clients.server.filter((client) => client.id !== id);
      gmLog('websocket', 'Server disconnected: ' + id);
    });
  }

  if (req.url && req.url.includes('discordID') && req.url.includes('token')) {
    const args = new URLSearchParams(req.url.split('?')[1].split('/').join('&'));
    const discordID = args.get('discordID');
    const barerToken = args.get('token');

    if (discordID && barerToken) {
      const user = await getPanelUserFromDiscordID(discordID);
      if (!user) {
        gmLog('websocket', 'Client not found: ' + discordID);
        ws.close();
        return;
      }

      let guildAdminListID: string[] = [];
      let serverAdminListID: string[] = [];

      const guildAdminList = await user.findGuildsWithPermsForPanel();
      for (const guildID of guildAdminList) {
        const server = await getServersFromDiscordGuildID(guildID.id);
        if (server) {
          for (const serverID of server) {
            serverAdminListID.push(serverID.id);
          }
        }
        guildAdminListID.push(guildID.id);
      }

      clients.client = clients.client.filter((client) => client.panelUser.discordID !== discordID);
      clients.client.push({ ws, panelUser: user, guildAdminListID, serverAdminListID });
      gmLog('websocket', 'Client connected: ' + discordID);

      ws.on('message', async (message: string) => {
        try {
          const wsInfo = JSON.parse(message);

          if (!wsInfo.action) {
            return;
          }

          gmLog('websocket', 'Received from client ' + discordID + ' ' + JSON.stringify(wsInfo));

          switch (wsInfo.action) {
            case 'server_status':
              const { serverID } = wsInfo.data;

              const serverVersion = await redis.get(`server:${serverID}:version`);
              const serverLastRequest = await redis.get(`server:${serverID}:last_request`);

              // reply with server status
              wsSendToClient(
                discordID,
                {
                  action: 'server_status',
                  serverID,
                  version: serverVersion,
                  versionComparator: serverVersion ? versionComparator(lastGmodIntegrationTag, serverVersion) : 1,
                  lastRequest: serverLastRequest
                    ? new Date(serverLastRequest)
                    : new Date(new Date().getTime() - 1000 * 60 * 2),
                  isWebSocketConnected: !!clients.server.find((client) => client.id === serverID),
                },
                'server_status',
              );

              break;
            default:
              break;
          }
        } catch (e) {
          gmLog('websocket', 'Error parsing message from client ' + discordID + ' ' + e);
        }
      });

      ws.on('close', () => {
        clients.client = clients.client.filter((client) => client.panelUser.discordID !== discordID);
        gmLog('websocket', 'Client disconnected: ' + discordID);
      });
    }
  }

  setInterval(() => {
    ws.ping();
  }, 1000);
});

export function wsSendToServer(id: string, data: any) {
  const client = clients.server.find((client) => client.id === id);

  if (!client) {
    return false;
  }

  const stringData = JSON.stringify(data);

  gmLog('websocket', 'Sending to server ' + id + ' ' + stringData);
  client.ws.send(stringData);

  return true;
}

export function wsSendToClient(discordID: string, data: any, action: string) {
  // const client = clients.client.find((client) => client.discordID === discordID && client.action === action);
  //
  // if (!client) {
  //   return false;
  // }
  //
  // gmLog('websocket', 'Sending to client ' + discordID + ' ' + JSON.stringify(data));
  // client.ws.send(JSON.stringify(data));

  const client = clients.client.find((client) => client.panelUser.discordID === discordID);

  if (!client) {
    return false;
  }

  gmLog('websocket', 'Sending to client ' + discordID + ' ' + JSON.stringify(data));
  client.ws.send(JSON.stringify(data));

  return true;
}

export function wsSendToAllClientsOfServer(serverID: string, action: string, data: any) {
  // const clientsToSend = clients.client.filter((client) => client.serverID === serverID && client.action === action);
  //
  // for (const client of clientsToSend) {
  //   gmLog('websocket', 'Sending to client ' + client.discordID + ' ' + JSON.stringify(data));
  //   client.ws.send(JSON.stringify(data));
  // }
  const clientsToSend = clients.client.filter((client) => client.serverAdminListID.includes(serverID));

  for (const client of clientsToSend) {
    gmLog('websocket', 'Sending to client ' + client.panelUser.discordID + ' ' + JSON.stringify(data));
    client.ws.send(
      JSON.stringify({
        action,
        serverID,
        data,
      }),
    );
  }

  return true;
}

gmLog('websocket', 'Listening on port ' + serverConfig.ports.websocket);

export async function gracefulShutdownWebsocket() {
  wss.close();
}
