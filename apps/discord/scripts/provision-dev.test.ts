import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ChannelType, PermissionFlagsBits, Routes, type REST } from 'discord.js'
import { provisionDevDiscord, provisionMain } from './provision-dev.js'

const guildId = '100000000000000001'
const botId = '100000000000000002'
const botRoleId = '100000000000000003'
const categoryId = '100000000000000004'
const allPermissions = Object.values(PermissionFlagsBits).reduce((all, permission) => all | permission, 0n)

function fakeDiscord(existing = false) {
  let sequence = 100n
  const roles: any[] = [
    { id: guildId, name: '@everyone', permissions: '0', position: 0 },
    { id: botRoleId, name: 'Development bot', permissions: '8', position: 1 },
  ]
  const channels: any[] = []
  const requests: { method: string; path: string; options?: any }[] = []
  const exactMessages = new Map<string, { id: string } | { error: number }>()
  const rest = {
    async get(path: string, options?: any) {
      requests.push({ method: 'get', path, options })
      if (path === Routes.user()) return { id: botId }
      if (path === Routes.guild(guildId)) return { id: guildId }
      if (path === Routes.guildMember(guildId, botId)) return { roles: [botRoleId] }
      if (path === Routes.guildRoles(guildId)) return roles
      if (path === Routes.guildChannels(guildId)) return channels
      if (path === Routes.guildWebhooks(guildId))
        return [{ id: 'webhook-1', channel_id: 'webhook-channel', token: 'must-not-be-returned' }]
      if (exactMessages.has(path)) {
        const value = exactMessages.get(path)!
        if ('error' in value) throw { code: value.error }
        return value
      }
      if (path.endsWith('/messages')) return [{ id: 'recent-message' }]
      throw new Error(`Unexpected GET ${path}`)
    },
    async post(path: string, options: any) {
      requests.push({ method: 'post', path, options })
      const id = String(100000000000000000n + sequence++)
      if (path === Routes.guildRoles(guildId)) {
        const role = { id, ...options.body, position: 1, managed: false }
        roles.push(role)
        return role
      }
      if (path === Routes.guildChannels(guildId)) {
        const channel = { id, ...options.body }
        channels.push(channel)
        return channel
      }
      throw new Error(`Unexpected POST ${path}`)
    },
  }
  if (existing) {
    channels.push({ id: categoryId, name: '[DEMO] Gmod Integration', type: ChannelType.GuildCategory })
    for (const name of [
      'demo-status',
      'demo-verification',
      'demo-logs',
      'demo-screenshots',
      'demo-votes',
      'demo-chat',
    ]) {
      channels.push({
        id: String(100000000000000000n + sequence++),
        name,
        type: ChannelType.GuildText,
        parent_id: categoryId,
      })
    }
    for (const name of ['[DEMO] Membre', '[DEMO] Vérifié', '[DEMO] VIP', '[DEMO] Citoyen']) {
      roles.push({ id: String(100000000000000000n + sequence++), name, position: 1, permissions: '0', managed: false })
    }
  }
  return { rest: rest as Pick<REST, 'get' | 'post'>, roles, channels, requests, exactMessages }
}

describe('development Discord resource provisioning', () => {
  it('previews missing resources without making Discord changes', async () => {
    const discord = fakeDiscord()
    const result = await provisionDevDiscord(discord.rest, guildId, true)
    assert.equal(result.categoryId, null)
    assert.deepEqual(Object.values(result.channels), Array(6).fill(null))
    assert.deepEqual(Object.values(result.roles), Array(4).fill(null))
    assert.deepEqual(result.created, { channels: 0, roles: 0 })
    assert.ok(discord.requests.every((request) => request.method === 'get'))
    assert.deepEqual(result.webhookIds, ['webhook-1'])
    assert.deepEqual(result.webhooks, [{ id: 'webhook-1', channelId: 'webhook-channel' }])
    assert.ok(!JSON.stringify(result).includes('must-not-be-returned'))
  })

  it('creates only isolated zero-permission demo resources and reuses them on the next run', async () => {
    const discord = fakeDiscord()
    discord.channels.push({
      id: 'unrelated',
      name: 'demo-status',
      type: ChannelType.GuildVoice,
      parent_id: 'other-category',
    })
    const first = await provisionDevDiscord(discord.rest, guildId, false)
    assert.deepEqual(first.created, { channels: 7, roles: 4 })
    assert.ok(Object.values(first.channels).every(Boolean))
    assert.ok(Object.values(first.roles).every(Boolean))
    assert.ok(
      discord.requests
        .filter((request) => request.method === 'post')
        .every((request) => request.options.reason === 'Development integration fixtures'),
    )
    for (const role of discord.roles.slice(2)) {
      assert.equal(role.permissions, '0')
      assert.equal(role.mentionable, false)
    }
    const posts = discord.requests.filter((request) => request.method === 'post').length
    const second = await provisionDevDiscord(discord.rest, guildId, false)
    assert.deepEqual(second.created, { channels: 0, roles: 0 })
    assert.deepEqual(second.channels, first.channels)
    assert.deepEqual(second.roles, first.roles)
    assert.equal(discord.requests.filter((request) => request.method === 'post').length, posts)
    assert.ok(discord.channels.find((channel) => channel.id === 'unrelated'))
  })

  it('reads exact saved messages beyond the most recent 100 without returning webhook tokens', async () => {
    const discord = fakeDiscord(true)
    const channelId = discord.channels.find((channel) => channel.name === 'demo-status').id
    const saved = [
      { channelId, messageId: 'old-valid' },
      { channelId, messageId: 'deleted' },
      { channelId, messageId: 'deleted-channel' },
      { channelId: 'unrelated', messageId: 'never-read' },
    ]
    discord.exactMessages.set(Routes.channelMessage(channelId, 'old-valid'), { id: 'old-valid' })
    discord.exactMessages.set(Routes.channelMessage(channelId, 'deleted'), { error: 10008 })
    discord.exactMessages.set(Routes.channelMessage(channelId, 'deleted-channel'), { error: 10003 })
    const result = await provisionDevDiscord(discord.rest, guildId, true, saved)
    assert.deepEqual(result.messageIds[channelId], ['recent-message', 'old-valid'])
    assert.ok(!discord.requests.some((request) => request.path.includes('never-read')))
    assert.ok(
      discord.requests
        .filter((request) => request.path.endsWith('/messages'))
        .every((request) => request.options.query.get('limit') === '100'),
    )
    discord.exactMessages.set(Routes.channelMessage(channelId, 'forbidden'), { error: 50013 })
    await assert.rejects(provisionDevDiscord(discord.rest, guildId, true, [{ channelId, messageId: 'forbidden' }]), {
      code: 50013,
    })
  })

  it('refuses ambiguous names and mismatched category or text-channel types before writing', async () => {
    for (const change of [
      (discord: ReturnType<typeof fakeDiscord>) => discord.channels.push({ ...discord.channels[0], id: 'duplicate' }),
      (discord: ReturnType<typeof fakeDiscord>) => {
        discord.channels[0].type = ChannelType.GuildText
      },
      (discord: ReturnType<typeof fakeDiscord>) => {
        discord.channels[1].type = ChannelType.GuildVoice
      },
      (discord: ReturnType<typeof fakeDiscord>) => discord.roles.push({ ...discord.roles[2], id: 'duplicate' }),
    ]) {
      const discord = fakeDiscord(true)
      change(discord)
      await assert.rejects(provisionDevDiscord(discord.rest, guildId, false))
      assert.ok(!discord.requests.some((request) => request.method === 'post'))
    }
  })

  it('refuses managed, privileged or unmanageable demo roles before writing', async () => {
    for (const patch of [
      { managed: true },
      { permissions: '8' },
      { position: 2 },
      { id: '100000000000000000', position: 1 },
    ]) {
      const discord = fakeDiscord(true)
      Object.assign(discord.roles[2], patch)
      await assert.rejects(provisionDevDiscord(discord.rest, guildId, false), /below the bot/)
      assert.ok(!discord.requests.some((request) => request.method === 'post'))
    }
  })

  it('validates guild and effective channel permissions, with administrator bypass', async () => {
    const insufficient = fakeDiscord()
    insufficient.roles[1].permissions = '0'
    await assert.rejects(provisionDevDiscord(insufficient.rest, guildId, false), /permissions/)
    const discord = fakeDiscord(true)
    discord.roles[1].permissions = String(allPermissions & ~PermissionFlagsBits.Administrator)
    discord.channels[0].permission_overwrites = [
      { id: guildId, deny: String(PermissionFlagsBits.SendMessages), allow: '0' },
    ]
    await assert.rejects(provisionDevDiscord(discord.rest, guildId, false), /lacks permissions/)
    discord.channels[0].permission_overwrites.push({
      id: botRoleId,
      deny: '0',
      allow: String(PermissionFlagsBits.SendMessages),
    })
    assert.ok(await provisionDevDiscord(discord.rest, guildId, true))
    discord.channels[1].permission_overwrites = [
      { id: botId, deny: String(PermissionFlagsBits.SendMessages), allow: '0' },
    ]
    await assert.rejects(provisionDevDiscord(discord.rest, guildId, false), /lacks permissions/)
    discord.roles[1].permissions = String(PermissionFlagsBits.Administrator)
    assert.ok(await provisionDevDiscord(discord.rest, guildId, true))
  })

  it('rejects invalid CLI arguments before loading the environment', async () => {
    await assert.rejects(provisionMain([]), /--guild-id/)
    await assert.rejects(provisionMain(['--guild-id', 'wrong']), /--guild-id/)
    await assert.rejects(provisionMain(['--guild-id', guildId, '--message', 'bad']), /--message/)
    await assert.rejects(provisionMain(['--unknown']))
  })
})
