import { Component, ParentProps } from 'solid-js'
import { I18nProvider } from '../i18n'
import RedirectMiddleware from '../middleware/redirection'
import { Header } from '../components/layout/Header'
import { Footer } from '../components/layout/Footer/Footer'

export const App: Component = (props: ParentProps) => {
  return (
    <I18nProvider>
      <RedirectMiddleware />
      <Header />
      <div class="grow shrink-0 flex-auto flex flex-col">{props.children}</div>
      <Footer />
    </I18nProvider>
  )
}
