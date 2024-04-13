import {WebSocketServer} from 'ws';
import {serverConfig} from '../config/index.js';
import {getConnectionPromise} from "../database/connection.js";

// TypeError: WebSocket.Server is not a constructor
const wss = new WebSocketServer({
    port: serverConfig.ports.websocket, clientTracking: true, verifyClient: (info, cb) => {
        const {id, token} = info.req.headers;

        if (!id || !token) {
            cb(false, 401, 'Unauthorized');
            return;
        }

        const connection = getConnectionPromise();
        connection.query('SELECT * FROM gm_server WHERE id = ? AND token = ?', [id, token], (err, rows) => {
            if (err) throw err;
            if (rows && rows.length > 0) {
                console.log('Verified client ' + id);
                cb(true);
            } else {
                console.log('Unauthorized client ' + id);
                cb(false, 401, 'Unauthorized');
            }
        });
    }
});

console.log('WebSocket server started on port ' + serverConfig.ports.websocket);

let clients = [];

// when a client connects log header info
wss.on('connection', function connection(ws, req) {
    const {id, token} = req.headers;

    console.log('Client connected ' + id);
    clients = clients.filter(client => client.id !== id);
    clients.push({id: id, ws: ws});

    ws.on('close', () => {
        console.log('Client disconnected ' + id);
        clients = clients.filter(client => client.id !== id);
    });

    // // log message from client
    // ws.on('message', function incoming(message) {
    //     console.log('received: %s', message);
    //     if (token === intern_websocket_token) {
    //         const msgData = JSON.parse(message);
    //         // executeTodoTaskFromWS(msgData.id, msgData.task, msgData.data, (data) => {
    //         //     let toSend = {id: msgData.id, data: data};
    //         //     toSend = JSON.stringify(toSend);
    //         //     console.log('Sending to client ' + msgData.id + ': ' + toSend);
    //         //     ws.send(toSend);
    //         // }).then(r => {s
    //
    //         //     console.log('Task ' + msgData.task + ' executed');
    //         // });
    //
    //         console.log('Task ' + msgData.task + ' executed');
    //         switch (msgData.task) {
    //             case 'getServerPlayer':
    //                 console.log('getServerPlayer');
    //                 break;
    //             case 'getPlayerServerInformations':
    //                 console.log('getPlayerServerInformations');
    //                 break;
    //             default: {
    //                 console.log('Task not found');
    //             }
    //         }
    //     }
    // });

    // stay alive
    setInterval(() => {
        ws.ping();
    }, 10000);
});

export function wsSendToServer(id, data) {
    let success = false;
    clients.forEach(client => {
        if (client.id === id) {
            client.ws.send(JSON.stringify(data));
            success = true;
        }
    });

    if (!success) {
        console.log('Client ' + id + ' not found');
    } else {
        console.log('Sent to client ' + id + ': ' + JSON.stringify(data));
    }
    return success;
}

setInterval(() => {
    clients.forEach(client => {
        if (client.ws.readyState !== WebSocket.OPEN) {
            console.log('Client ' + client.id + ' not alive');
            clients = clients.filter(c => c.id !== client.id);
        }
    });
}, 300000);