import { Suspense, type ParentComponent } from 'solid-js'
import { I18nProvider } from '../i18n'
import RedirectMiddleware from '../middleware/redirection'
import { Header } from '../components/layout/Header'
import { Footer } from '../components/layout/Footer/Footer'
import { useI18n } from '../i18n'

const AppContent: ParentComponent = (props) => {
  const { t } = useI18n()
  return (
    <>
      <a class="skip-link" href="#main-content">
        {t('ui.skip_to_content', 'Skip to content')}
      </a>
      <RedirectMiddleware />
      <Header />
      <main id="main-content" tabIndex={-1} class="grow shrink-0 flex-auto flex flex-col">
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
      <Footer />
    </>
  )
}

export const App: ParentComponent = (props) => {
  return (
    <I18nProvider>
      <AppContent>{props.children}</AppContent>
    </I18nProvider>
  )
}
