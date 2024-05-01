import { getConnectionPromise } from '../../database/connection.js';

export async function getStats() {
  /*
  getConnection().then((connection) => {
            connection.query('SELECT COUNT(*) FROM gm_user WHERE steam IS NOT NULL', (error, res_verifyUser) => {
                if (error) {
                    reject(error);
                }
                connection.query('SELECT COUNT(*) FROM users', (error, res_user) => {
                    if (error) {
                        reject(error);
                    }
                    connection.query('SELECT * FROM gm_stat_discord', (error, res_stat) => {
                        if (error) {
                            reject(error);
                        }
                        connection.query('SELECT COUNT(*) FROM gm_server', (error, res_server) => {
                            if (error) {
                                reject(error);
                            }
                            resolve({
                                verifyUser: res_verifyUser[0]['COUNT(*)'],
                                user: res_stat[0]['guildMembers'] + res_user[0]['COUNT(*)'],
                                guild: res_stat[0]['guild'],
                                server: res_server[0]['COUNT(*)'],
                            });
                        });
                    });
                });
            });
        }).catch((err) => {
            reject(err);
        });
   */
  const connection = await getConnectionPromise();
  const [rows] = await connection.query('SELECT COUNT(*) FROM gm_user WHERE steam IS NOT NULL');
  const [rows2] = await connection.query('SELECT COUNT(*) FROM users');
  const [rows3] = await connection.query('SELECT * FROM gm_stat_discord');
  const [rows4] = await connection.query('SELECT COUNT(*) FROM gm_server');
  return {
    verifyUser: rows[0]['COUNT(*)'],
    user: rows3[0]['guildMembers'] + rows2[0]['COUNT(*)'],
    guild: rows3[0]['guild'],
    server: rows4[0]['COUNT(*)'],
  };
}
