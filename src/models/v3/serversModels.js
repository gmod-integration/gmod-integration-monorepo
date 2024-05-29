import { getConnectionPromise } from '../../database/connection.js';
import gm_server from '../../database/schema/gm_server.js';

export async function getGuildID(id) {
  const connection = await getConnectionPromise();
  const [rows] = connection.query('SELECT * FROM gm_server WHERE id = ?', [id]);
  if (rows.length > 0) {
    return rows[0].guild;
  }
  return null;
}

export async function isValidAuth(id, token) {
  const connection = await getConnectionPromise();
  const [rows] = connection.query('SELECT * FROM gm_server WHERE id = ? AND token = ?', [id, token]);
  return rows.length > 0;
}

export async function addServerLog(id, log) {
  const connection = await getConnectionPromise();
  const query = 'INSERT INTO gm_server_logs (serverID, type, data) VALUES (?, ?, ?)';
  const values = [id, log.type, JSON.stringify(log.data)];
  connection.query(query, values, (error) => {
    if (error) {
      console.error(error);
      return false;
    }
    return true;
  });
}

export async function getServerList(interaction, focusedOption, choices) {
  const guildServers = await gm_server.findAll({
    where: {
      guild: interaction.guildId,
    },
  });

  guildServers.forEach((server) => {
    choices[server.name] = server.id;
  });

  return Object.keys(choices).filter((choice) => choice.startsWith(focusedOption.value));
}
