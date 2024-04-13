import {getConnectionPromise} from '../../database/connection.js';

export function getInformations(id) {
    return new Promise((resolve, reject) => {
        const connection = getConnectionPromise();
        connection.query('SELECT * FROM gm_server WHERE id = ?', [id], (error, results) => {
            if (error) return reject(error);

            if (results.length > 0) {
                return resolve(results[0]);
            } else {
                reject('Server not found');
            }
        });
    });
}

export function isValidAuth(id, token) {
    return new Promise((resolve, reject) => {
        const connection = getConnectionPromise();
        connection.query('SELECT * FROM gm_server WHERE id = ? AND token = ?', [id, token], (error, results) => {
            if (error) return reject(error);

            if (results.length > 0) {
                return resolve(true);
            } else {
                return resolve(false);
            }
        });
    });
}