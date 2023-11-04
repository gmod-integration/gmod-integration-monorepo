// database/connection.js
const mysql = require('mysql2');
const { dbConfig } = require('../config');
const { gmLog } = require('../utils/logger');

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
                    gmLog('mysql', 'Connected');
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

getConnection();

module.exports = {
    getConnection
};