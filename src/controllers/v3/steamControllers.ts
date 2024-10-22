import { serverConfig } from '../../config';
import axios from 'axios';
import { gmLog } from '../../utils/logger';
import { NextFunction, Request, Response } from 'express';
import prisma from '../../prisma';

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

      for (const userWithSteam of usersWithSteam) {
        gmLog('steam', `STEAM MOVE FROM ${userWithSteam.id} TO ${user.id}`);
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

      res.redirect(`${serverConfig.websiteUrl}/account`);
    } else {
      res.json({ message: 'Authentication failed' });
    }
  } catch (error) {
    const err = error as Error;
    res.status(500).json({ message: 'An error occurred during authentication', error: err.message });
  }
}
