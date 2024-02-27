const {port_websocket, intern_websocket_token} = require('../config/index');
const {getConnection} = require('../database/connection');
const WebSocket = require('ws');

// timeout in 10min
const wss = new WebSocket.Server({
    port: port_websocket, clientTracking: true, verifyClient: (info, cb) => {
        const {id, token} = info.req.headers;

        if (!id || !token) {
            cb(false, 401, 'Unauthorized');
            return;
        }

        if (token === intern_websocket_token) {
            console.log('Verified internal client');
            cb(true);
            return;
        }

        getConnection().then(connection => {
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
        });
    }
});

console.log('WebSocket server started on port ' + port_websocket);

let clients = [];

// when a client connects log header info
wss.on('connection', function connection(ws, req) {
    const {id, token} = req.headers;

    console.log('Client connected ' + id);
    clients = clients.filter(client => client.id != id);
    clients.push({id: id, ws: ws});

    ws.on('close', () => {
        console.log('Client disconnected ' + id);
        clients = clients.filter(client => client.id != id);
    });

    // log message from client
    ws.on('message', function incoming(message) {
        console.log('received: %s', message);
        if (token === intern_websocket_token) {
            const msgData = JSON.parse(message);
            // executeTodoTaskFromWS(msgData.id, msgData.task, msgData.data, (data) => {
            //     let toSend = {id: msgData.id, data: data};
            //     toSend = JSON.stringify(toSend);
            //     console.log('Sending to client ' + msgData.id + ': ' + toSend);
            //     ws.send(toSend);
            // }).then(r => {
            //     console.log('Task ' + msgData.task + ' executed');
            // });
        }
    });

    // stay alive
    setInterval(() => {
        ws.ping();
    }, 10000);
});

function wsSendToClient(id, data) {
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

// every 5min check every client and remove if not alive
setInterval(() => {
    clients.forEach(client => {
        if (client.ws.readyState !== WebSocket.OPEN) {
            console.log('Client ' + client.id + ' not alive');
            clients = clients.filter(c => c.id !== client.id);
        }
    });
}, 300000);

module.exports = {
    wsSendToClient,
};