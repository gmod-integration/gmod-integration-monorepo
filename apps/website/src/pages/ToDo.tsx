import type { Component } from 'solid-js'
import { useI18n } from '../i18n'
import { ButtonLink, PageState } from '../components/ui/index.js'

const ToDo: Component = () => {
  const { t } = useI18n()

  return (
    <PageState
      icon="wrench"
      title={t('todo.title', 'To-Do')}
      description={t('todo.description', 'The page you are looking for does not exist yet.')}
    >
      <ButtonLink href="/dashboard/guilds">{t('main.dashboard', 'Dashboard')}</ButtonLink>
    </PageState>
  )
}

export default ToDo
