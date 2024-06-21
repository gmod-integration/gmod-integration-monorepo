import { badArgument } from '../../utils/tools.js';
import LuaErrors from '../../database/schema/LuaErrors.js';

export async function reportError(req, res) {
  let { error, stack, id, name, realm, identifier, uptime } = req.body;

  if (badArgument([error, stack, id, name, realm, identifier, uptime])) {
    return res.status(400).json({
      error: 'bad argument',
      arguments: [
        'error: ' + !!error,
        'stack: ' + !!stack,
        'id: ' + !!id,
        'name: ' + !!name,
        'real: ' + !!realm,
        'identifier: ' + !!identifier,
        'uptime: ' + !!uptime,
      ],
    });
  }

  stack = JSON.stringify(stack);

  const luaError = await LuaErrors.create({
    error,
    stack,
    id,
    name,
    realm,
    identifier,
    uptime,
  });

  return res.status(200).json(luaError);
}
