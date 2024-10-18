import { getTranslate } from '../../utils/localizations';

const trust_ranks: Record<number, string> = {
  0: 'dangerous',
  15: 'untrusted',
  30: 'semi-untrusted',
  40: 'neutral',
  60: 'semi-trusted',
  70: 'trusted',
  85: 'exemplary',
  100: 'legendary',
};

export async function getTrustRank(trust: number, lang: string) {
  let lastKey = 0;

  for (let key of Object.keys(trust_ranks).map(Number)) {
    if (trust <= key) {
      return await getTranslate(trust_ranks[lastKey], lang);
    }
    lastKey = key;
  }

  return await getTranslate('unknown_rank', lang);
}

export function dateToDiscordTimestamp(date: Date) {
  return '<t:' + Math.floor(date.getTime() / 1000) + ':R>';
}

export function secToTime(sec: number) {
  // convert seconds to ??w ??d ??h ??m ??s
  let time = '';
  const weeks = Math.floor(sec / 604800);
  const days = Math.floor(sec / 86400) % 7;
  const hours = Math.floor(sec / 3600) % 24;
  const minutes = Math.floor(sec / 60) % 60;
  const seconds = sec % 60;

  if (weeks > 0) {
    time += weeks + 'w ';
  }
  if (days > 0) {
    time += days + 'd ';
  }
  if (hours > 0) {
    time += hours + 'h ';
  }
  if (minutes > 0) {
    time += minutes + 'm ';
  }
  if (seconds > 0) {
    time += seconds + 's';
  }

  return time;
}
