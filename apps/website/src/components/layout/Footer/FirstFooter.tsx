import { For, type Component } from 'solid-js'
import { A } from '@solidjs/router'
import { useI18n } from '../../../i18n'

interface footerLink {
  title: string
  href: string
}

interface footerCategory {
  title: string
  links: footerLink[]
}

const FirstFooter: Component = () => {
  const { t } = useI18n()

  const footerLinks = (): footerCategory[] => [
    {
      title: t('main.services', 'Services'),
      links: [
        {
          title: t('main.dashboard', 'Dashboard'),
          href: '/dashboard',
        },
        {
          title: t('main.servers_ranking', 'Servers Ranking'),
          href: '/servers',
        },
      ],
    },
    {
      title: t('main.resources', 'Resources'),
      links: [
        {
          title: t('main.documentation', 'Documentation'),
          href: '/docs',
        },
        {
          title: t('main.premium', 'Premium'),
          href: '/premium',
        },
        {
          title: t('main.support', 'Help and support'),
          href: '/support',
        },
      ],
    },
    {
      title: t('ui.legal', 'Legal'),
      links: [
        {
          title: t('main.terms', 'Terms of Service'),
          href: '/legal/terms',
        },
        {
          title: t('main.privacy', 'Privacy Policy'),
          href: '/legal/privacy',
        },
      ],
    },
  ]

  return (
    <div class="site-footer-links">
      <For each={footerLinks()}>
        {({ title, links }) => (
          <nav aria-label={title}>
            <h3>{title}</h3>
            <For each={links}>
              {({ title, href }) => (
                <A class="site-footer-link" href={href}>
                  {title}
                </A>
              )}
            </For>
          </nav>
        )}
      </For>
    </div>
  )
}

export default FirstFooter
