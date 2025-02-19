import { getEmojis } from 'unicode-emoji';
import { serverConfig } from '../config/index.js';
import prisma from '../prisma.js';
import { Request, Response } from 'express';

export function getRandomDiscordRelay() {
  let relays = [];
  if (serverConfig.dev) {
    relays.push('https://dsc-relay-dev.gmod-integration.com');
  } else {
    relays.push('https://1-dsc-relay.gmod-integration.com');
  }
  return relays[Math.floor(Math.random() * relays.length)];
}

export function getEmojiVersion(emoji: string) {
  const emojis = getEmojis();
  const emojiData = emojis.find((e) => e.emoji === emoji);
  if (emojiData) {
    return emojiData.version;
  } else {
    return null;
  }
}

export function badArgument(list: any[]) {
  let valid = true;
  const failedArg = [];

  for (let i = 0; i < list.length; i++) {
    if (list[i] === undefined) {
      valid = false;
      failedArg.push(i);
    }
  }

  if (!valid) {
    return failedArg.join(', ');
  }

  return false;
}

export function ipGetIP(ip: string) {
  if (ip.includes(':')) {
    return ip.split(':')[0];
  }
  return ip;
}

export function generateToken(length: number) {
  let token = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    token += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return token;
}

export async function addNotification(discordID: string, type: string, message: string) {
  // TODO send notification to websocket for webpanel user
  await prisma.gm_users_notifications.create({
    data: {
      discordID,
      type,
      message,
    },
  });
}

export function todoControllers(req: Request, res: Response) {
  return res.status(501).send({
    error: 'Not Implemented',
  });
}

async function fetchLastTag() {
  return await fetch('https://api.github.com/repos/gmod-integration/lua/tags')
    .then((response) => response.json())
    .then((data) => {
      return data[0].name;
    })
    .catch((error) => {
      console.error('Error:', error);
      return 'Unknown';
    });
}

// update every 10 min
export let lastGmodIntegrationTag = await fetchLastTag();
setInterval(
  async () => {
    lastGmodIntegrationTag = await fetchLastTag();
  },
  1000 * 60 * 10,
);

/*
 * Compare two versions
 * @param {string} version1
 * @param {string} version2
 * @returns {number} 1 if version1 > version2, -1 if version1 < version2, 0 if version1 === version2
 * @example
 * versionComparator('1.0.0', '1.0.1') // -1
 * versionComparator('1.0.1', '1.0.0') // 1
 * versionComparator('1.0.0', '1.0.0') // 0
 */
export function versionComparator(version1: string, version2: string) {
  const v1 = version1.startsWith('v') ? version1.slice(1) : version1;
  const v2 = version2.startsWith('v') ? version2.slice(1) : version2;

  for (let i = 0; i < v1.length; i++) {
    if (parseInt(v1[i]) > parseInt(v2[i])) {
      return 1;
    } else if (parseInt(v1[i]) < parseInt(v2[i])) {
      return -1;
    }
  }

  return 0;
}
