export const CURRENT_DISCORD_SUBSCRIPTION_SKU_ID = '1260321278208770150'
export const LEGACY_DISCORD_SUBSCRIPTION_SKU_ID = '1224469371225636965'

/** Existing deployments may still configure the retired official offer. Keep its
 * entitlements valid while directing all new purchases to the current offer. */
export function discordSubscriptionSKUs(configuredSKU: string) {
  const official = [CURRENT_DISCORD_SUBSCRIPTION_SKU_ID, LEGACY_DISCORD_SUBSCRIPTION_SKU_ID].includes(configuredSKU)
  return {
    subscriptionSKUID: official ? CURRENT_DISCORD_SUBSCRIPTION_SKU_ID : configuredSKU,
    subscriptionSKUIDs: official
      ? [CURRENT_DISCORD_SUBSCRIPTION_SKU_ID, LEGACY_DISCORD_SUBSCRIPTION_SKU_ID]
      : [configuredSKU],
  }
}
