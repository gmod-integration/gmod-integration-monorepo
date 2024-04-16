import { badArgument } from '../../utils/tools.js';
import { saveScreenshot, sendScreenshotToDiscord } from '../../models/v3/clientsModels.js';

export async function uploadScreenshot(req, res) {
  const server = req.server;
  const { player, screenshot, captureData, size } = req.body;

  if (badArgument([player, screenshot, captureData, size])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        player: !!player,
        screenshot: !!screenshot,
        captureData: !!captureData,
        size: !!size,
      },
    });
  }

  saveScreenshot(screenshot, captureData, player)
    .then(async (result) => {
      try {
        await sendScreenshotToDiscord(result, player, server);
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'internal_server_error' });
      }
      return res.status(200).json({ success: true, url: result.url });
    })
    .catch((err) => {
      console.log(err);
      return res.status(500).json({ error: 'internal_server_error' });
    });
}
