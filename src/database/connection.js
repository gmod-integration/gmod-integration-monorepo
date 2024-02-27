// database/connection.js
const mysql = require('mysql2');
const {dbConfig} = require('../config');
const {gmLog} = require('../utils/logger');

let connection;

function getConnection() {
    return new Promise((resolve, reject) => {
        if (connection && connection.state !== 'disconnected') {
            resolve(connection);
        } else {
            connection = mysql.createConnection(dbConfig);
            connection.connect((err) => {
                if (err) {
                    gmLog('mysql', 'Connection Error');
                    console.error(err);
                    reject(err);
                } else {
                    gmLog('mysql', 'Connected to ' + dbConfig.host + ':' + (dbConfig.port || 3306) + '/' + dbConfig.database);
                    // Keep connection alive by pinging every 60 seconds
                    setInterval(() => {
                        connection.ping();
                    }, 60000);
                    resolve(connection);
                }
            });
        }
    });
}

const mysql2Promise = require('mysql2/promise')
let connectionPromise;

async function getConnectionPromisse() {
    if (connectionPromise && connectionPromise.state !== 'disconnected') {
        return connectionPromise;
    } else {
        try {
            connectionPromise = await mysql2Promise.createConnection(dbConfig);
            gmLog('mysql2Promise', 'Connected to ' + dbConfig.host + ':' + (dbConfig.port || 3306) + '/' + dbConfig.database);
            // Keep connectionPromise alive by pinging every 60 seconds
            setInterval(async () => {
                try {
                    await connectionPromise.ping();
                } catch (error) {
                    console.error(error);
                    gmLog('mysql2Promise', 'Ping failed');
                }
            }, 60000);
            return connectionPromise;
        } catch (err) {
            gmLog('mysql2Promise', 'Connection Error');
            console.error(err);
            throw err; // Throw l'erreur pour pouvoir la catcher là où getConnection est appelée
        }
    }
}


module.exports = {
    getConnection,
    getConnectionPromisse
};