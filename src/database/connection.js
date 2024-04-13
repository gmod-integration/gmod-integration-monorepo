import mysql from 'mysql2/promise';
import {databaseConfig} from "../config/index.js";
import {gmLog} from "../utils/logger.js";
import {readFileSync} from "fs";

let connectionPromise;

export async function getConnectionPromise() {
    if (connectionPromise && connectionPromise.state !== 'disconnected') {
        return connectionPromise;
    } else {
        try {
            connectionPromise = await mysql.createConnection({
                host: databaseConfig.host,
                user: databaseConfig.user,
                password: databaseConfig.password,
                database: databaseConfig.database,
                port: databaseConfig.port || 3306
            });
            gmLog('mysql2', `Connected to ${databaseConfig.host}:${databaseConfig.port || 3306}/${databaseConfig.database}`);
            return connectionPromise;
        } catch (err) {
            gmLog('mysql2', `Failed to connect to ${databaseConfig.host}:${databaseConfig.port || 3306}/${databaseConfig.database}`);
            console.error(err);
            throw err;
        }
    }
}

setInterval(async () => {
    try {
        await connectionPromise.ping();
    } catch (e) {
        console.error('Error pinging database:', e);
    }
}, 10000);

export async function executeSqlFile(filePath) {
    try {
        const connection = await getConnectionPromise();

        const sqlCommands = readFileSync(filePath, {encoding: 'utf-8'});
        const commands = sqlCommands.split(';').map(command => command.trim()).filter(command => command.length);

        for (let command of commands) {
            await connection.execute(command);
        }
    } catch (error) {
        console.error('Error executing SQL file:', error);
    }
}