import { Show, Suspense, type ParentComponent } from 'solid-js'
import { useLocation } from '@solidjs/router'
import { I18nProvider } from '../i18n'
import RedirectMiddleware from '../middleware/redirection'
import { Header } from '../components/layout/Header'
import { Footer } from '../components/layout/Footer/Footer'
import { useI18n } from '../i18n'
import { DraftEditingProvider } from '../components/DraftEditingProvider.js'

const AppContent: ParentComponent = (props) => {
  const { t } = useI18n()
  const location = useLocation()
  const dashboard = () => location.pathname.startsWith('/dashboard')
  return (
    <div class="site-shell">
      <DraftEditingProvider>
        <a class="skip-link" href="#main-content">
          {t('ui.skip_to_content', 'Skip to content')}
        </a>
        <RedirectMiddleware />
        <Header />
        <main
          id="main-content"
          tabIndex={-1}
          class="site-main grow shrink-0 flex-auto flex flex-col"
          classList={{ 'dashboard-canvas': dashboard() }}
        >
          <Suspense
            fallback={
              <div role="status" class="flex flex-1 items-center justify-center gap-3 p-8">
                <span aria-hidden="true" class="loading loading-spinner" />
                <span>{t('ui.loading', 'Loading…')}</span>
              </div>
            }
          >
            {props.children}
          </Suspense>
        </main>
        <Show when={!dashboard()}>
          <Footer />
        </Show>
      </DraftEditingProvider>
    </div>
  )
}

export const App: ParentComponent = (props) => {
  return (
    <I18nProvider>
      <AppContent>{props.children}</AppContent>
    </I18nProvider>
  )
}
