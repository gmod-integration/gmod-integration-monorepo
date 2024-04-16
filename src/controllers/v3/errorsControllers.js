import { badArgument } from '../../utils/tools.js';
import { saveError } from '../../models/v3/errorsModels.js';

export function reportError(req, res) {
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

  saveError({ error, stack, id, name, realm, identifier, uptime })
    .then(() => {
      res.status(200).json({ success: true });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'internal server error' });
    });
}
