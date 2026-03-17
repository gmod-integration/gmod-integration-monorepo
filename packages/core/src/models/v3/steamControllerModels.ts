import { ConfigServer } from '@gmod/config';
import axios from 'axios';
import { gmLog } from '../../utils/logger.js';
import prisma from '@gmod/infra-prisma';
import { removeDiscordSync, removeServerSync } from '../../classes/v3/PlayerGmod.js';
import { getPanelUserFromDiscordID } from '@gmod/domain-user/PanelUser.js';
import { enqueueDiscordGuildVerifyUser } from '@gmod/infra-bullmq/discordQueueAdapters.js';

const steamAuthUrl = 'https://steamcommunity.com/openid/login';

type SteamControllerResult =
  | { kind: 'redirect'; status: number; url: string }
  | { kind: 'text'; status: number; text: string }
  | { kind: 'json'; status: number; body: unknown };

function getStringParam(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

export function processSteamVerification(query: Record<string, unknown>): SteamControllerResult {
  const verificationCode = getStringParam(query.verificationCode);
  if (!verificationCode) {
    return { kind: 'text', status: 400, text: 'Verification code is required' };
  }

  const returnUrl = `${ConfigServer.domain}/steam/return?verificationCode=${verificationCode}`;
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnUrl,
    'openid.realm': ConfigServer.domain || '',
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });

  return { kind: 'redirect', status: 302, url: `${steamAuthUrl}?${params.toString()}` };
}

export async function processSteamVerificationReturn(query: Record<string, unknown>): Promise<SteamControllerResult> {
  const verificationCode = getStringParam(query.verificationCode);
  if (!verificationCode) {
    return { kind: 'text', status: 400, text: 'Verification code is missing' };
  }

  const user = await prisma.gm_user.findFirst({
    where: {
      token: verificationCode,
      token_expires: {
        gte: new Date(),
      },
    },
  });

  if (!user) {
    return { kind: 'text', status: 400, text: 'Verification code is invalid or expired' };
  }

  const params = new URLSearchParams({
    'openid.ns': getStringParam(query['openid.ns']) || '',
    'openid.mode': 'check_authentication',
    'openid.op_endpoint': getStringParam(query['openid.op_endpoint']) || '',
    'openid.claimed_id': getStringParam(query['openid.claimed_id']) || '',
    'openid.identity': getStringParam(query['openid.identity']) || '',
    'openid.return_to': getStringParam(query['openid.return_to']) || '',
    'openid.response_nonce': getStringParam(query['openid.response_nonce']) || '',
    'openid.assoc_handle': getStringParam(query['openid.assoc_handle']) || '',
    'openid.signed': getStringParam(query['openid.signed']) || '',
    'openid.sig': getStringParam(query['openid.sig']) || '',
  });

  try {
    const verificationResponse = await axios.post(steamAuthUrl, params);
    if (!verificationResponse.data.includes('is_valid:true')) {
      return { kind: 'json', status: 200, body: { message: 'Authentication failed' } };
    }

    const claimedId = getStringParam(query['openid.claimed_id']) || '';
    const steamID64 = claimedId.split('/').pop();
    if (!steamID64) {
      return { kind: 'json', status: 200, body: { message: 'Authentication failed' } };
    }

    const usersWithSteam = await prisma.gm_user.findMany({
      where: {
        steam: steamID64,
      },
    });

    const oldDscToClean: string[] = [];
    const oldSteamToClean: string[] = [];

    for (const userWithSteam of usersWithSteam) {
      if (userWithSteam.id === user.id && userWithSteam.steam === steamID64) {
        continue;
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

      if (userWithSteam.steam && userWithSteam.steam !== steamID64 && !oldSteamToClean.includes(userWithSteam.steam)) {
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
        await enqueueDiscordGuildVerifyUser(aGuild.id, user.id);
      }
    }

    return { kind: 'redirect', status: 302, url: `${ConfigServer.websiteUrl}/account` };
  } catch (error) {
    const err = error as Error;
    return {
      kind: 'json',
      status: 500,
      body: { message: 'An error occurred during authentication', error: err.message },
    };
  }
}
