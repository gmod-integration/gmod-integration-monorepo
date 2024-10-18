import { getEmojis } from 'unicode-emoji';
import { serverConfig } from '../config';
import prisma from '../prisma';

export function getRandomDiscordRelay() {
  let relays = [];
  if (serverConfig.production === 'true') {
    relays.push('https://1-dsc-relay.gmod-integration.com');
  } else {
    relays.push('https://dsc-relay-dev.gmod-integration.com');
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
