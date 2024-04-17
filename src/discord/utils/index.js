import { getTranslate } from '../../utils/localizations.js';

const trust_ranks = {
  0: 'dangerous',
  15: 'untrusted',
  30: 'semi-untrusted',
  40: 'neutral',
  60: 'semi-trusted',
  70: 'trusted',
  85: 'exemplary',
  100: 'legendary',
};

export function getTrustRank(trust, lang) {
  let lastKey = 0;

  for (let key in trust_ranks) {
    if (trust <= key) {
      return getTranslate(trust_ranks[lastKey], lang);
    }
    lastKey = key;
  }

  return getTranslate('unknown_rank', lang);
}
