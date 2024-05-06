import { getConnectionPromise } from '../../database/connection.js';

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
  const connection = await getConnectionPromise();
  const [rows] = await connection.query(
    `SELECT *
     FROM gm_server
     WHERE guild = ?`,
    [interaction.guild.id],
  );
  if (rows && rows.length > 0) {
    rows.forEach((row) => {
      choices[row.name] = row.id;
    });
  }

  return Object.keys(choices).filter((choice) => choice.startsWith(focusedOption.value));
}
