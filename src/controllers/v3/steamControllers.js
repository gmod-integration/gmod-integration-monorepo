import { serverConfig } from '../../config/index.js';
import axios from 'axios';
import gm_user from '../../database/schema/gm_user.js';
import { gmLog } from '../../utils/logger.js';

const steamAuthUrl = 'https://steamcommunity.com/openid/login';

export async function steamVerification(req, res) {
  const { verificationCode } = req.query;
  if (!verificationCode) {
    return res.status(400).send('Verification code is required');
  }

  const returnUrl = `${serverConfig.domain}/steam/return?verificationCode=${verificationCode}`;
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnUrl,
    'openid.realm': serverConfig.domain,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });

  res.redirect(`${steamAuthUrl}?${params.toString()}`);
}

export async function steamVerificationReturn(req, res) {
  const { verificationCode } = req.query;
  if (!verificationCode) {
    return res.status(400).send('Verification code is missing');
  }

  const user = await gm_user.findOne({
    where: {
      token: verificationCode,
    },
  });

  if (!user) {
    return res.status(400).send('Verification code is invalid');
  }

  if (user.token_expires < new Date()) {
    return res.status(400).send('Verification code has expired');
  }

  const params = new URLSearchParams({
    'openid.ns': req.query['openid.ns'],
    'openid.mode': 'check_authentication',
    'openid.op_endpoint': req.query['openid.op_endpoint'],
    'openid.claimed_id': req.query['openid.claimed_id'],
    'openid.identity': req.query['openid.identity'],
    'openid.return_to': req.query['openid.return_to'],
    'openid.response_nonce': req.query['openid.response_nonce'],
    'openid.assoc_handle': req.query['openid.assoc_handle'],
    'openid.signed': req.query['openid.signed'],
    'openid.sig': req.query['openid.sig'],
  });

  try {
    const verificationResponse = await axios.post(steamAuthUrl, params);
    if (verificationResponse.data.includes('is_valid:true')) {
      const steamID64 = req.query['openid.claimed_id'].split('/').pop();

      const usersWithSteam = await gm_user.findAll({
        where: {
          steam: steamID64,
        },
      });

      for (const userWithSteam of usersWithSteam) {
        userWithSteam.steam = null;
        gmLog('steam', `STEAM MOVE FROM ${userWithSteam.id} TO ${user.id}`);
        await userWithSteam.save();
      }

      user.token = null;
      user.token_expires = null;
      user.last_oauth = new Date();
      user.steam = steamID64;
      await user.save();

      res.redirect(`${serverConfig.websiteUrl}/account`);
    } else {
      res.json({ message: 'Authentication failed' });
    }
  } catch (error) {
    res.status(500).json({ message: 'An error occurred during authentication', error: error.message });
  }
}
