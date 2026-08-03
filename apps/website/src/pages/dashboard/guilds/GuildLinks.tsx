import { Component, createResource, createSignal, For, Match, Show, Switch } from 'solid-js'
import AdminPanel from '../../../components/AdminPanel'
import AdminModal from '../../../components/AdminModal'
import { useI18n } from '../../../i18n'
import { BuyPremiumBtn } from '../../../utils/premium'
import { fetchAPI } from '../../../utils/api'
import { LinkValue } from '../../../components/popup/LinkValue'
import { TextValue } from '../../../components/popup/TextValue'

class Link {
  id: number
  alias: string
  url: string
  active: boolean

  constructor(id: number, alias: string, url: string, active: boolean) {
    this.id = id
    this.alias = alias
    this.url = url
    this.active = active
  }

  setActive(active: boolean) {
    this.active = active
  }

  setAlias(alias: string) {
    this.alias = alias
  }

  setUrl(url: string) {
    this.url = url
  }

  getId() {
    return this.id
  }

  getAlias() {
    return this.alias
  }

  getUrl() {
    return this.url
  }

  isActive() {
    return this.active
  }
}

const fetchLinks = async () => {
  const linksArray: Link[] = []
  const res = await fetchAPI('/users/:discordID/guilds/:guildID/links', 'GET')
  if (!res.ok) {
    return linksArray
  }
  const links = await res.json()
  for (const link of links) {
    linksArray.push(new Link(link.id, link.alias, link.url, link.active))
  }
  return linksArray
}

const GuildLinks: Component = () => {
  const [links, { mutate }] = createResource('links', fetchLinks)
  const [selectedLink, setSelectedLink] = createSignal<Link>(new Link(0, '', '', false))
  const { t } = useI18n()

  const deleteLink = async (link: Link) => {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/links/${link.id}`, 'DELETE')
    if (!res.ok) {
      return
    }
    mutate((prevLinks) => (prevLinks ? prevLinks.filter((l) => l.getId() !== link.getId()) : []))
    return link
  }

  const editLink = async (link: Link) => {
    const res = await fetchAPI(`/users/:discordID/guilds/:guildID/links/${link.id}`, 'PUT', {
      alias: link.alias,
      url: link.url,
      active: link.active,
    })
    if (!res.ok) {
      return
    }
    const updatedLink = await res.json()
    const newLinks = new Link(updatedLink.id, updatedLink.alias, updatedLink.url, updatedLink.active)
    mutate((prevLinks) => (prevLinks ? prevLinks.map((l) => (l.getId() === newLinks.getId() ? newLinks : l)) : []))
    return newLinks
  }

  const createLink = async () => {
    const newLink = await fetchAPI(`/users/:discordID/guilds/:guildID/links`, 'POST')
    if (!newLink.ok) {
      return
    }
    const link = await newLink.json()
    const newLinkObj = new Link(link.id, link.alias, link.url, link.active)
    mutate((prevLinks) => (prevLinks ? [...prevLinks, newLinkObj] : [newLinkObj]))
    return newLinkObj
  }

  return (
    <>
      {/*<PremiumFeature message="The free plan only allows you to create 2 links." />*/}
      <AdminModal title={t('dashboard.guild.links.edit_link', 'Edit Link')} id="edit_select_link">
        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.guild.links.alias', 'Alias')}</span>
          </label>
          <input
            type="text"
            class="input"
            disabled={links.loading}
            value={selectedLink().getAlias()}
            onInput={(e) => {
              selectedLink().setAlias(e.currentTarget.value)
            }}
          />
        </div>

        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.guild.links.url', 'URL')}</span>
          </label>
          <input
            type="text"
            class="input"
            disabled={links.loading}
            value={selectedLink().getUrl()}
            onInput={(e) => {
              selectedLink().setUrl(e.currentTarget.value)
            }}
          />
        </div>

        <div class="fieldset">
          <label class="label">
            <span>{t('dashboard.guild.links.active', 'Active')}</span>
          </label>
          <select
            class="select"
            disabled={links.loading}
            value={selectedLink().isActive() ? 'true' : 'false'}
            onChange={(e) => {
              selectedLink().setActive(e.currentTarget.value === 'true')
            }}
          >
            <option value="true">{t('dashboard.guild.links.yes', 'Yes')}</option>
            <option value="false">{t('dashboard.guild.links.no', 'No')}</option>
          </select>
        </div>

        <button
          disabled={links.loading}
          class="btn btn-base-200 mt-2"
          onclick="edit_select_link.close()"
          onClick={async () => {
            await editLink(selectedLink())
          }}
        >
          {t('dashboard.guild.links.save', 'Save')}
        </button>
      </AdminModal>

      <AdminPanel
        title={t('dashboard.guild.links.title', 'Links')}
        description={t('dashboard.guild.links.description', 'Create shortcuts for your server informations.')}
        type="none"
      >
        <table class="table border-b border-base-300 rounded-none">
          <thead>
            <tr class="text-l">
              <th>{t('dashboard.guild.links.alias', 'Alias')}</th>
              <th>{t('dashboard.guild.links.url', 'URL')}</th>
              <th class="w-1/6 text-center">{t('dashboard.guild.links.active', 'Active')}</th>
              <th class="w-1/6 text-center">{t('dashboard.guild.links.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {/* Bug fix: also gate on !links.error - `links()` is read unguarded below (via
                <For each={links()}>), and reading a resource accessor while it's in an error
                state re-throws that error, which crashed the render (leaving it stuck on the
                loading state forever) and made the `Match when={links.error}` message below
                unreachable. Mirrors the same fix already applied to ServerPlayers.tsx. */}
            <Show when={!links.loading && !links.error}>
              <For each={links()}>
                {(link) => (
                  <tr>
                    <td>
                      <TextValue value={link.alias} />
                    </td>
                    <td>
                      <LinkValue url={link.url} />
                    </td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        {link.active ? (
                          <i class="fa-solid fa-check text-success"></i>
                        ) : (
                          <i class="fa-solid fa-times text-error"></i>
                        )}
                      </div>
                    </td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        <div class="tooltip tooltip-info" data-tip={t('dashboard.guild.links.edit', 'Edit')}>
                          <i
                            class="hover:cursor-pointer fa-solid fa-edit"
                            onClick={() => {
                              // @ts-expect-error -- intentional: legacy typing gap
                              edit_select_link.showModal()
                              setSelectedLink(link)
                            }}
                          ></i>
                        </div>
                        <div class="tooltip tooltip-error" data-tip={t('dashboard.guild.links.delete', 'Delete')}>
                          <i
                            class="hover:cursor-pointer fa-solid fa-trash text-error"
                            onClick={() => deleteLink(link)}
                          ></i>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>

        <Switch>
          <Match when={links.loading}>
            <div class="flex justify-center h-36">
              <div class="loading loading-spinner loading-lg"></div>
            </div>
          </Match>
          <Match when={links.error}>
            <div>{t('dashboard.guild.links.failed_to_load', 'Failed to load the links')}</div>
          </Match>
        </Switch>

        {/* Bug fix: also gate on !links.error - see the tbody Show above for why reading
            links() unguarded (via subCondition below) crashes the render when the resource
            errored. */}
        <Show when={!links.loading && !links.error}>
          <div class="flex gap-4 p-4">
            <BuyPremiumBtn
              subCondition={links()?.length < 2}
              btnText={t('dashboard.guild.links.premium', 'Limited to 2 links for free users.')}
              hidden={links.loading}
            >
              <button
                class="btn btn-base-200"
                disabled={links.loading}
                onClick={async () => {
                  await createLink()
                }}
              >
                {t('dashboard.guild.links.add_link', 'Add Link')}
              </button>
            </BuyPremiumBtn>
          </div>
        </Show>
      </AdminPanel>
    </>
  )
}

export default GuildLinks
