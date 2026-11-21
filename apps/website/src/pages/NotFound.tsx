import { Component, Match, Switch } from 'solid-js'
import { isRedirecting } from '../middleware/redirection'
import { useI18n } from '../i18n.js'
import { ButtonLink, Icon, PageState } from '../components/ui/index.js'

const NotFound: Component = () => {
  const { t } = useI18n()
  return (
    <Switch>
      <Match when={isRedirecting() != ''}>
        <PageState icon="external-link" title={t('ui.redirecting', 'Redirecting...')} status>
          <ButtonLink href={isRedirecting()} variant="primary">
            {t('main.click_if_not_redirected', 'Click here if you are not redirected.')}
          </ButtonLink>
        </PageState>
      </Match>
      <Match when={isRedirecting() == ''}>
        <PageState
          icon="search"
          title="404"
          description={t('ui.not_found_description', 'The page you are looking for does not exist.')}
        >
          <ButtonLink href="/" variant="primary">
            <Icon name="arrow-left" size={16} />
            {t('ui.back_home', 'Back to home')}
          </ButtonLink>
        </PageState>
      </Match>
    </Switch>
  )
}

export default NotFound
