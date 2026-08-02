import { describe, expect, it, vi } from 'vitest'
import { ButtonStyle } from 'discord.js'

const getTranslateMock = vi.fn(async (key: string) => key)
vi.mock('@gmod/core/utils/localizations.js', () => ({ getTranslate: getTranslateMock }))

vi.mock('@gmod/config', () => ({
  ConfigDiscord: {
    oauthPanel: 'https://panel.example/oauth',
    invite: 'https://discord.com/invite/example',
  },
  ConfigServer: {
    websiteUrl: 'https://website.example',
  },
}))

const {
  ButtonVerificationWebsite,
  ButtonWebsite,
  ButtonDiscordSupport,
  ButtonInviteBot,
  ButtonVerify,
  ButtonConnect,
  ButtonPremium,
} = await import('../../../src/discord/utils/buttons.js')

describe('discord/utils/buttons', () => {
  it('ButtonVerificationWebsite builds a link button without a guildID', async () => {
    const button = await ButtonVerificationWebsite('en')
    const json = button.toJSON() as any
    expect(json.style).toBe(ButtonStyle.Link)
    expect(json.label).toBe('⠀verify_yourself')
    expect(json.emoji.name).toBe('🛡️')
    expect(json.url).toBe(
      'https://panel.example/oauth&state=' +
        encodeURIComponent('redirect:/account?startVerification=true'),
    )
    expect(getTranslateMock).toHaveBeenCalledWith('verify_yourself', 'en')
  })

  it('ButtonVerificationWebsite appends guildID to the state param when provided', async () => {
    const button = await ButtonVerificationWebsite('fr', 'guild123')
    const json = button.toJSON() as any
    expect(json.url).toBe(
      'https://panel.example/oauth&state=' +
        encodeURIComponent('redirect:/account?startVerification=true&guildID=guild123'),
    )
  })

  it('ButtonWebsite builds a link button to the website', async () => {
    const button = await ButtonWebsite('en')
    const json = button.toJSON() as any
    expect(json.style).toBe(ButtonStyle.Link)
    expect(json.label).toBe('⠀website')
    expect(json.emoji.name).toBe('🌐')
    expect(json.url).toBe('https://website.example')
  })

  it('ButtonDiscordSupport builds a link button to the support discord', async () => {
    const button = await ButtonDiscordSupport('en')
    const json = button.toJSON() as any
    expect(json.style).toBe(ButtonStyle.Link)
    expect(json.label).toBe('⠀discord_support')
    expect(json.emoji.name).toBe('🚨')
    expect(json.url).toBe('https://discord.gg/AexDDx5RaU')
  })

  it('ButtonInviteBot builds a link button to invite the bot', async () => {
    const button = await ButtonInviteBot('en')
    const json = button.toJSON() as any
    expect(json.style).toBe(ButtonStyle.Link)
    expect(json.label).toBe('⠀invite_bot')
    expect(json.emoji.name).toBe('🔗')
    expect(json.url).toBe('https://discord.com/invite/example')
  })

  it('ButtonVerify builds a secondary button with a customId', async () => {
    const button = await ButtonVerify('en')
    const json = button.toJSON() as any
    expect(json.style).toBe(ButtonStyle.Secondary)
    expect(json.label).toBe('⠀check_verification')
    expect(json.emoji.name).toBe('🔎')
    expect(json.custom_id).toBe('verify')
  })

  it('ButtonConnect keeps the ip unchanged when it has no port suffix', async () => {
    const button = await ButtonConnect('en', '203.0.113.5', '27015')
    const json = button.toJSON() as any
    expect(json.style).toBe(ButtonStyle.Link)
    expect(json.label).toBe('⠀server-connect')
    expect(json.emoji.name).toBe('🔗')
    expect(json.url).toBe('https://website.example/open?link=steam://connect/203.0.113.5:27015')
  })

  it('ButtonConnect strips an embedded port when the ip already contains one', async () => {
    const button = await ButtonConnect('en', '203.0.113.5:27016', '27015')
    const json = button.toJSON() as any
    expect(json.url).toBe('https://website.example/open?link=steam://connect/203.0.113.5:27015')
  })

  it('ButtonPremium builds a primary button with a customId', async () => {
    const button = await ButtonPremium('en')
    const json = button.toJSON() as any
    expect(json.style).toBe(ButtonStyle.Primary)
    expect(json.label).toBe('⠀premium')
    expect(json.emoji.name).toBe('💎')
    expect(json.custom_id).toBe('premium')
  })
})
