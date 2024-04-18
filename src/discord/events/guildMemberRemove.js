import { getConnectionPromise } from '../../database/connection.js';

export default {
  name: 'guildMemberRemove',
  async execute(remove_info) {
    const connection = await getConnectionPromise();
    connection.query('UPDATE gm_guild SET member = member - 1 WHERE guild = ?', [remove_info.guild.id], (err) => {
      if (err) throw err;
    });
  },
};
