import { badArgument } from '../../utils/tools.js';
import { saveScreenshot, sendScreenshotToDiscord } from '../../models/v3/clientsModels.js';
import { Request, Response } from 'express';
import prisma from '@gmod/infra-prisma/index.js';

export async function uploadScreenshot(req: Request, res: Response) {
  const server = req.server!;
  const { player, screenshot, captureData, size, title } = req.body;

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

  const { discordUrl, filename, internUrl } = await saveScreenshot(screenshot, captureData, player, server, title);
  await sendScreenshotToDiscord(discordUrl, internUrl, filename, player, server, title);
  res.status(200).json({ success: true });
}

export async function reportBugs(req: Request, res: Response) {
  const server = req.server!;
  const { player, screenshot, description, importance, steps, expected, actual } = req.body;

  if (badArgument([player, description, importance, steps, expected, actual])) {
    return res.status(400).json({
      error: 'missing_arguments',
      args: {
        player: !!player,
        description: !!description,
        importance: !!importance,
        steps: !!steps,
        expected: !!expected,
        actual: !!actual,
      },
    });
  }

  let screenshotName = '';
  if (screenshot) {
    const { screenshot: screenshot2, captureData, size } = screenshot;
    if (screenshot2 && captureData && size) {
      const { internUrl, filename } = await saveScreenshot(screenshot2, captureData, player, server, '').catch(
        (err) => {
          console.error(err);
          return { internUrl: '', filename: '' };
        },
      );
      screenshotName = filename;
    }
  }

  res.status(200).json(
    await prisma.gm_server_report_bugs.create({
      data: {
        serverID: server.id,
        steamID64: player.steamID64,
        description,
        status: 'open',
        steps,
        expected,
        actual,
        importance,
        screenshot: screenshotName,
      },
    }),
  );
}
