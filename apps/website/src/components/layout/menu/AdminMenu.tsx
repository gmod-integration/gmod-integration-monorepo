import { createSignal, createUniqueId, For, Show, type Component } from 'solid-js'
import { A, useLocation } from '@solidjs/router'
import { useI18n } from '../../../i18n.js'

export const AdminMenu: Component = () => {
  const { t } = useI18n()
  const location = useLocation()
  const navigationId = createUniqueId()
  const [onlyShowEmoji, setOnlyShowEmoji] = createSignal(
    (() => {
      try {
        return localStorage.getItem('admin-navigation-collapsed') === 'true'
      } catch {
        return false
      }
    })(),
  )
  const [hoverExpand, setHoverExpand] = createSignal(false)
  const expanded = () => !onlyShowEmoji() || hoverExpand()
  const toggleCollapsed = () => {
    const next = !onlyShowEmoji()
    setOnlyShowEmoji(next)
    try {
      localStorage.setItem('admin-navigation-collapsed', String(next))
    } catch {
      // The menu still works when browser storage is unavailable.
    }
  }
  const links = () => [
    {
      label: t('dashboard.menu.admin.information', 'Information'),
      emoji: 'fa-info',
      url: '/dashboard/admins/informations',
    },
    { label: t('main.guilds', 'Guilds'), emoji: 'fa-server', url: '/dashboard/admins/guilds' },
    {
      label: t('dashboard.menu.admin.impersonate', 'Impersonate'),
      emoji: 'fa-user-secret',
      url: '/dashboard/admins/impersonate',
    },
  ]

  return (
    <>
      <aside
        class="flex flex-col p-4 gap-2"
        classList={{ 'min-w-[240px]': expanded() }}
        onMouseEnter={() => setHoverExpand(true)}
        onMouseLeave={() => setHoverExpand(false)}
      >
        <div class="flex items-center p-2 gap-4">
          <div class="flex justify-center items-center min-w-6 min-h-6">
            <i aria-hidden="true" class="fa-solid fa-screwdriver-wrench" />
          </div>
          <Show when={expanded()}>{t('dashboard.menu.admin.title', 'Admin')}</Show>
        </div>
        <hr class="border border-base-200" />
        <nav id={navigationId} aria-label={t('dashboard.menu.admin.title', 'Admin')} class="contents">
          <For each={links()}>
            {(link) => (
              <A
                href={link.url}
                class="flex items-center gap-4 p-2 rounded-md"
                classList={{ 'bg-base-200': location.pathname === link.url }}
                aria-label={link.label}
                aria-current={location.pathname === link.url ? 'page' : undefined}
                title={onlyShowEmoji() ? link.label : undefined}
              >
                <div class="flex justify-center items-center min-w-6 min-h-6">
                  <i aria-hidden="true" class={`fa-solid ${link.emoji}`} />
                </div>
                <Show when={expanded()}>
                  <span>{link.label}</span>
                </Show>
              </A>
            )}
          </For>
        </nav>
        <div class="flex flex-col mt-auto">
          <hr class="border border-base-200 mb-4" />
          <button
            type="button"
            class="flex items-center p-2 gap-4 hover:font-bold text-left"
            aria-label={
              onlyShowEmoji() ? t('dashboard.menu.expand', 'Expand') : t('dashboard.menu.collapse', 'Collapse')
            }
            aria-controls={navigationId}
            aria-expanded={expanded()}
            onClick={toggleCollapsed}
          >
            <div class="flex justify-center items-center min-w-6 min-h-6">
              <i
                aria-hidden="true"
                class={`fa-solid ${onlyShowEmoji() ? 'fa-angle-double-right' : 'fa-angle-double-left'}`}
              />
            </div>
            <Show when={expanded()}>
              <span>
                {onlyShowEmoji() ? t('dashboard.menu.expand', 'Expand') : t('dashboard.menu.collapse', 'Collapse')}
              </span>
            </Show>
          </button>
        </div>
      </aside>
      <div class="border border-base-200" />
    </>
  )
}
