import { getConnectionPromise } from '../../database/connection.js';

export async function getStats() {
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
