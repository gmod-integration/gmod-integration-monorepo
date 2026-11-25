import prisma from '@gmod/infra-prisma'
import { hasPrivacyHashSecret, isErasureBlocked, privacySubject } from '@gmod/infra-prisma/privacy.js'

export { isErasureBlocked, privacySubject, type PrivacyProvider } from '@gmod/infra-prisma/privacy.js'
export const PRIVACY_REVOCATION_CHANNEL = 'gmi:privacy:revoked'

export class PersonalDataErasureError extends Error {
  readonly code = 'personal_data_erasure_blocked'

  constructor() {
    super('Personal data collection is disabled for this account.')
    this.name = 'PersonalDataErasureError'
  }
}

export async function assertPersonalDataAllowed(discordID?: string | null, steamID64?: string | null): Promise<void> {
  if (await isErasureBlocked(discordID, steamID64)) throw new PersonalDataErasureError()
}

/** An explicit zero reputation must survive erasure and a later account creation. */
export async function getRetainedTrust(discordID?: string | null, steamID64?: string | null): Promise<number | null> {
  if (!hasPrivacyHashSecret()) return null
  for (const [provider, id] of [
    ['discord', discordID],
    ['steam', steamID64],
  ] as const) {
    if (!id) continue
    const security = await prisma.gm_user_security.findUnique({
      where: { subject: privacySubject(provider, id) },
      select: { trust: true },
    })
    if (security) return security.trust
  }
  return null
}

/** Only the OAuth callback may reactivate a completed erasure; background refreshes cannot. */
export async function prepareExplicitOAuthLogin(discordID: string): Promise<void> {
  if (!hasPrivacyHashSecret()) return
  const discordSubject = privacySubject('discord', discordID)
  const requests = await prisma.gm_user_erasure.findMany({
    where: { discordSubject, reactivatedAt: null },
    select: { id: true, status: true },
  })
  if (requests.length === 0) return
  if (requests.some((request) => request.status !== 'completed')) throw new PersonalDataErasureError()
  const trust = (await getRetainedTrust(discordID)) ?? 50
  await prisma.$transaction(async (tx) => {
    const reactivated = await tx.gm_user_erasure.updateMany({
      where: { discordSubject, status: 'completed', reactivatedAt: null },
      data: { reactivatedAt: new Date() },
    })
    if (reactivated.count !== requests.length) throw new PersonalDataErasureError()
    await tx.gm_panelToken.deleteMany({ where: { discordID } })
    await tx.gm_discordToken.deleteMany({ where: { discordID } })
    // Do not revive an old Steam link, verification token, privileged rank or session.
    await tx.gm_user.updateMany({
      where: { id: discordID },
      data: { steam: null, email: null, token: null, token_expires: null, rank: 'user', trust },
    })
  })
}
