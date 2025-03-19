import { serverConfig } from '../../config/index.js';
import axios from 'axios';
import { gmLog } from '../../utils/logger.js';
import { NextFunction, Request, Response } from 'express';
import prisma from '../../prisma.js';
import { removeDiscordSync, removeServerSync } from '../../classes/v3/PlayerGmod.js';
import { verifyUser } from '../../models/v3/discordModels.js';
import { getPanelUserFromDiscordID } from '../../classes/v3/PanelUser.js';
import { getGuildClient } from '../../discord/index.js';

const steamAuthUrl = 'https://steamcommunity.com/openid/login';

export async function steamVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { verificationCode } = req.query;

  if (!verificationCode) {
    res.status(400).send('Verification code is required');
    return;
  }

  const returnUrl = `${serverConfig.domain}/steam/return?verificationCode=${verificationCode}`;
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnUrl,
    'openid.realm': serverConfig.domain || '',
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });

  res.redirect(`${steamAuthUrl}?${params.toString()}`);
}

export async function steamVerificationReturn(req: Request, res: Response): Promise<void> {
  const { verificationCode } = req.query;
  if (!verificationCode) {
    res.status(400).send('Verification code is missing');
    return;
  }

  const user = await prisma.gm_user.findFirst({
    where: {
      token: verificationCode as string,
      token_expires: {
        gte: new Date(),
      },
    },
  });

  if (!user) {
    res.status(400).send('Verification code is invalid or expired');
    return;
  }

  const params = new URLSearchParams({
    'openid.ns': req.query['openid.ns'] as string,
    'openid.mode': 'check_authentication',
    'openid.op_endpoint': req.query['openid.op_endpoint'] as string,
    'openid.claimed_id': req.query['openid.claimed_id'] as string,
    'openid.identity': req.query['openid.identity'] as string,
    'openid.return_to': req.query['openid.return_to'] as string,
    'openid.response_nonce': req.query['openid.response_nonce'] as string,
    'openid.assoc_handle': req.query['openid.assoc_handle'] as string,
    'openid.signed': req.query['openid.signed'] as string,
    'openid.sig': req.query['openid.sig'] as string,
  });

  try {
    const verificationResponse = await axios.post(steamAuthUrl, params);
    if (verificationResponse.data.includes('is_valid:true')) {
      const steamID64 = (req.query['openid.claimed_id'] as string)?.split('/').pop();

      const usersWithSteam = await prisma.gm_user.findMany({
        where: {
          steam: steamID64,
        },
      });

      let oldDscToClean: string[] = [];
      let oldSteamToClean: string[] = [];

      for (const userWithSteam of usersWithSteam) {
        if (userWithSteam.id === user.id && userWithSteam.steam === steamID64) {
          continue; // Skip the user if it's the same as the one we're updating
        }

        await prisma.gm_users_transfers.create({
          data: {
            oldSteamID64: userWithSteam.steam ?? '',
            newSteamID64: steamID64,
            oldDiscordID: userWithSteam.id,
            newDiscordID: user.id,
          },
        });

        gmLog('steam', `STEAM MOVE FROM ${userWithSteam.id} TO ${user.id}`);

        if (user.id !== userWithSteam.id && !oldDscToClean.includes(userWithSteam.id)) {
          oldDscToClean.push(userWithSteam.id);
          await removeDiscordSync(userWithSteam.id);
        }

        if (
          userWithSteam.steam &&
          userWithSteam.steam !== steamID64 &&
          !oldSteamToClean.includes(userWithSteam.steam)
        ) {
          oldSteamToClean.push(userWithSteam.steam);
          await removeServerSync(userWithSteam.steam);
        }

        await prisma.gm_user.update({
          where: {
            id: userWithSteam.id,
          },
          data: {
            steam: null,
          },
        });
      }

      await prisma.gm_user.update({
        where: {
          id: user.id,
        },
        data: {
          token: null,
          token_expires: null,
          last_oauth: new Date(),
          steam: steamID64,
        },
      });

      const panelUser = await getPanelUserFromDiscordID(user.id);
      if (panelUser) {
        const guilds = await panelUser.findGuilds();
        for (const aGuild of guilds) {
          const dbGuild = await prisma.gm_guild.findFirst({
            where: {
              guild: aGuild.id,
            },
          });
          if (!dbGuild) continue;

          const client = await getGuildClient(aGuild.id);
          if (!client) continue;

          const guild = await client.guilds.fetch(aGuild.id).catch(() => null);
          if (!guild) continue;

          const userInf = await guild.members.fetch(user.id).catch(() => null);
          if (!userInf) continue;

          await verifyUser(guild, userInf);
        }
      }

      res.redirect(`${serverConfig.websiteUrl}/account`);
    } else {
      res.json({ message: 'Authentication failed' });
    }
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ message: 'An error occurred during authentication', error: err.message });
  }
}
