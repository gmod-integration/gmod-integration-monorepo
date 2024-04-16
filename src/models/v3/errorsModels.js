import { getConnectionPromise } from '../../database/connection.js';

export async function saveError({ error, stack, id, name, realm, identifier, uptime }) {
  return new Promise(async (resolve, reject) => {
    const connection = await getConnectionPromise();
    await connection.query(
      'INSERT INTO gm_errors (error, stack, workshopID, name, realm, identifier, uptime) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [error, stack, id, name, realm, identifier, uptime],
    );
    resolve();
  });
}
