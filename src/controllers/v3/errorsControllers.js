import { badArgument } from '../../utils/tools.ts';
import ServerLuaError from '../../database/schema/ServerLuaError.js';

export async function reportError(req, res) {
  let { error, stack, id, name, realm, uptime, count } = req.body;

  const { serverID, steamID64 } = req.params;

  if (badArgument([error, stack, id, name, realm, uptime, count])) {
    return res.status(400).json({
      error: 'bad argument',
      arguments: [
        'error: ' + !!error,
        'stack: ' + !!stack,
        'id: ' + !!id,
        'name: ' + !!name,
        'real: ' + !!realm,
        'uptime: ' + !!uptime,
        'count: ' + !!count,
      ],
    });
  }

  stack = JSON.stringify(stack);

  const luaError = await ServerLuaError.create({
    error,
    stack,
    workshopID: id || '',
    serverID,
    name,
    realm,
    steamID64: steamID64 || '',
    uptime,
    count,
  });

  return res.status(200).json(luaError);
}
