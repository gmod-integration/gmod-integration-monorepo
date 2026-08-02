import { describe, expect, it, vi } from 'vitest'

vi.mock('@gmod/config', () => ({
  ConfigDiscord: { oauthPanel: 'https://panel.example/oauth', embedColor: 0x123456 },
}))

const getTranslateMock = vi.fn(async (key: string, _lang?: string, options?: string[]) =>
  options ? `${key}:${options.join(',')}` : key,
)
vi.mock('../src/localizations.js', () => ({ getTranslate: getTranslateMock }))

const {
  ButtonVerificationWebsite,
  ButtonVerify,
  ButtonDiscordSupport,
  ButtonPremium,
  getVerifiedMessageAnswer,
  getVerificationGuildMessage,
} = await import('../src/discordMessages.js')

const fakeUser = { id: 'u1' } as any

describe('discordMessages', () => {
  it('ButtonVerificationWebsite builds a link button with the panel OAuth URL', async () => {
    const button = await ButtonVerificationWebsite('en')
    const json = button.toJSON() as any
    expect(json.style).toBe(5) // Link
    expect(json.url).toContain('https://panel.example/oauth')
    expect(json.url).toContain(encodeURIComponent('redirect:/account?startVerification=true'))
  })

  it('ButtonVerificationWebsite appends the guildID query param when provided', async () => {
    const button = await ButtonVerificationWebsite('en', 'g1')
    const json = button.toJSON() as any
    expect(json.url).toContain(encodeURIComponent('&guildID=g1'))
  })

  it('ButtonVerify builds a secondary button with the verify customId', async () => {
    const button = await ButtonVerify('en')
    const json = button.toJSON() as any
    expect(json.style).toBe(2) // Secondary
    expect(json.custom_id).toBe('verify')
  })

  it('ButtonDiscordSupport builds a link button to the support server', async () => {
    const button = await ButtonDiscordSupport('en')
    const json = button.toJSON() as any
    expect(json.url).toBe('https://discord.gg/AexDDx5RaU')
  })

  it('ButtonPremium builds a primary button with the premium customId', async () => {
    const button = await ButtonPremium('en')
    const json = button.toJSON() as any
    expect(json.style).toBe(1) // Primary
    expect(json.custom_id).toBe('premium')
  })

  describe('getVerifiedMessageAnswer', () => {
    it('returns the self-verified message when verified and self-triggered', async () => {
      const result = await getVerifiedMessageAnswer(true, 'en', fakeUser, true)
      expect(result).toEqual({ content: 'user_verified_self', ephemeral: true })
    })

    it('returns the verified-by-other message when verified and not self-triggered', async () => {
      const result = await getVerifiedMessageAnswer(true, 'en', fakeUser, false)
      expect(result).toEqual({ content: 'user_verified:<@u1>', ephemeral: true })
    })

    it('returns the self-not-verified message with a button when not verified and self-triggered', async () => {
      const result: any = await getVerifiedMessageAnswer(false, 'en', fakeUser, true)
      expect(result.content).toContain('user_not_verified_self:/verify')
      expect(result.components).toHaveLength(1)
    })

    it('returns the not-verified-by-other message with a button when not verified and not self-triggered', async () => {
      const result: any = await getVerifiedMessageAnswer(false, 'en', fakeUser, false)
      expect(result.content).toContain('user_not_verified:<@u1>,/verify')
      expect(result.components).toHaveLength(1)
    })
  })

  it('getVerificationGuildMessage builds an embed with fields and action buttons', async () => {
    const result = await getVerificationGuildMessage('en', 'g1')
    expect(result.embeds).toHaveLength(1)
    expect(result.components).toHaveLength(1)
    const embedJson = result.embeds[0].toJSON()
    expect(embedJson.fields).toHaveLength(4)
  })
})
