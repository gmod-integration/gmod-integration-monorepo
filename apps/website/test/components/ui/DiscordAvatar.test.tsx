import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { DiscordAvatar } from '../../../src/components/ui/index.js'
import type { DiscordAvatarIdentity } from '../../../src/utils/discordAvatar.js'

afterEach(() => cleanup())

const user = { id: '4194304', avatarURL: 'https://cdn.discordapp.com/custom.png' }
const defaultAvatar = 'https://cdn.discordapp.com/embed/avatars/1.png'

describe('DiscordAvatar', () => {
  it('displays the Discord display avatar decoratively beside the existing identity label', () => {
    const { container } = render(() => (
      <DiscordAvatar user={{ ...user, displayAvatarURL: '/avatars/discord/4194304' }} class="account-avatar" />
    ))
    const image = container.querySelector('img')!
    expect(image).toHaveAttribute('src', '/avatars/discord/4194304')
    expect(image).toHaveAttribute('alt', '')
    expect(image.closest('[aria-hidden="true"]')).toBeInTheDocument()
    expect(container.querySelector('.account-avatar')).toBeInTheDocument()
  })

  it('tries Discord’s default once after image failure, then renders an offline icon without another image', async () => {
    const { container } = render(() => <DiscordAvatar user={user} />)
    await fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toHaveAttribute('src', defaultAvatar)
    await fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(container.querySelector('[data-icon="user-round"]')).toBeInTheDocument()
  })

  it('does not retry a default image as its own fallback', async () => {
    const { container } = render(() => <DiscordAvatar user={{ id: user.id }} />)
    expect(container.querySelector('img')).toHaveAttribute('src', defaultAvatar)
    await fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  it('recovers after a profile refresh and ignores errors from the previous identity’s image', async () => {
    const [identity, setIdentity] = createSignal<DiscordAvatarIdentity>(user)
    const { container } = render(() => <DiscordAvatar user={identity()} />)
    await fireEvent.error(container.querySelector('img')!)
    await fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).not.toBeInTheDocument()

    setIdentity({ ...user, avatarURL: 'https://cdn.discordapp.com/new.png' })
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.discordapp.com/new.png')
    await fireEvent.error(container.querySelector('img')!)
    const previousDefault = container.querySelector('img')!
    expect(previousDefault).toHaveAttribute('src', defaultAvatar)

    setIdentity({ id: '8388608', avatarURL: 'https://cdn.discordapp.com/new.png' })
    await fireEvent.error(previousDefault)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.discordapp.com/new.png')
    await fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.discordapp.com/embed/avatars/2.png')
  })

  it('keeps signed-out identities empty and loads an avatar when the authenticated identity arrives', () => {
    const [identity, setIdentity] = createSignal<DiscordAvatarIdentity>({})
    const { container } = render(() => <DiscordAvatar user={identity()} />)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    setIdentity(user)
    expect(container.querySelector('img')).toHaveAttribute('src', user.avatarURL)
  })
})
