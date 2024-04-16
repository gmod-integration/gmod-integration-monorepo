import { getUserFromDiscordID, getUserFromSteamID64 } from '../../classes/v3/User.js';

export async function getProfile(req, res) {
  const { steamID64, discordID } = req.query;

  if (discordID) {
    const user = await getUserFromDiscordID(discordID);
    if (!user) {
      return res.status(404).send({
        error: 'User not found',
      });
    }
    return res.send(user);
  }

  if (steamID64) {
    const user = await getUserFromSteamID64(steamID64);
    if (!user) {
      return res.status(404).send({
        error: 'User not found',
      });
    }
    return res.send(user);
  }

  return res.status(400).send({
    error: 'Missing required query parameter',
  });
}

export async function getUserGuildsOwnOrAdmins(req, res) {
  const panelUser = req.panelUser;

  return res.send(await panelUser.findGuildsWithPerms());
}
