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

  const { url, filename } = await saveScreenshot(screenshot, captureData, player, server);
  await sendScreenshotToDiscord(url, filename, player, server);
  res.status(200).json({ success: true });
}
