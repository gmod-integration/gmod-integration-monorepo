/** Route fixtures provide explicit grants; the full owner/purchase/rank policy lives in domain-user tests. */
export function dashboardAccessFromAdminFixture(
  panel: { isAdminOfGuild(guildID: string, options?: { fresh: boolean }): Promise<boolean> },
  guildID: string,
  options: { fresh?: boolean; serverID?: string } = {},
) {
  return options.fresh ? panel.isAdminOfGuild(guildID, { fresh: true }) : panel.isAdminOfGuild(guildID)
}

export async function resolveDashboardAccessFromAdminFixture(
  panel: Parameters<typeof dashboardAccessFromAdminFixture>[0],
  guildID: string,
  options: Parameters<typeof dashboardAccessFromAdminFixture>[2] = {},
) {
  return (await dashboardAccessFromAdminFixture(panel, guildID, options))
    ? { allowed: true as const }
    : { allowed: false as const, reason: 'discord_admin_required' as const }
}
