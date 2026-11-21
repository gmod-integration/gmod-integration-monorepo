import { privacySubject } from './privacy.js'

/** Stable entitlement lookup for later refunds; it must never become a personal account key again. */
export function erasedPurchaseKey(steamID64: string): string {
  return `erased:${privacySubject('steam', steamID64)}`
}
