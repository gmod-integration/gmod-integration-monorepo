import type { Entitlement } from 'discord.js'
import { invalidateGuildAccess } from '@gmod/domain-access/index.js'
import { gmLog } from '@gmod/shared/logger.js'

/** Provider changes invalidate the shared snapshot; every consumer resolves the same fresh policy. */
export async function refreshEntitlementAccess(entitlement: Entitlement) {
  if (!entitlement.guildId) return
  try {
    await invalidateGuildAccess(entitlement.guildId)
  } catch {
    gmLog('discord', 'Subscription access invalidation is waiting for reconciliation')
  }
}
