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
const {writeFileSync, readFileSync} = require("fs");
const {join} = require("path");

let connectionPromise;

async function getConnectionPromisse() {
    if (connectionPromise && connectionPromise.state !== 'disconnected') {
        return connectionPromise;
    } else {
        try {
            connectionPromise = await mysql2Promise.createConnection(dbConfig);
            gmLog('mysql2', 'Connected to ' + dbConfig.host + ':' + (dbConfig.port || 3306) + '/' + dbConfig.database);
            return connectionPromise;
        } catch (err) {
            gmLog('mysql2', 'Connection Error');
            console.error(err);
            throw err;
        }
    }
}

// Keep connectionPromise alive by pinging every 60 seconds
setInterval(async () => {
    try {
        await connectionPromise.ping();
    } catch (error) {
        console.error(error);
        gmLog('mysql2', 'Ping failed');
    }
}, 60000);

async function executeSqlFile(filePath) {
    try {
        const connection = await getConnectionPromisse();

        // Read the SQL file
        const sqlCommands = readFileSync(filePath, {encoding: 'utf-8'});

        // Split the file content by SQL command delimiter (e.g., `;` for MySQL)
        const commands = sqlCommands.split(';').map(command => command.trim()).filter(command => command.length);

        // Execute each SQL command
        for (let command of commands) {
            await connection.execute(command);
        }

        await connection.end();
    } catch (error) {
        console.error('Error executing SQL file:', error);
    }
}

executeSqlFile('./src/database/shema.sql').then(() => {
    gmLog('mysql2', 'Database schema created');
});

module.exports = {
    getConnection,
    getConnectionPromisse
};