import type { Component } from 'solid-js'
import { useI18n } from '../i18n'
import { ButtonLink, PageState } from '../components/ui/index.js'

const ToDo: Component = () => {
  const { t } = useI18n()

  return (
    <PageState
      icon="wrench"
      title={t('todo.title', 'Feature in development')}
      description={t(
        'todo.description',
        'This feature is not available yet. Return to the dashboard to use the features already supported.',
      )}
    >
      <ButtonLink href="/dashboard/guilds">{t('main.dashboard', 'Dashboard')}</ButtonLink>
    </PageState>
  )
}

export default ToDo
