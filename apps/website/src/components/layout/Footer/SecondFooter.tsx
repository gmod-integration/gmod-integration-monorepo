import type { Component } from 'solid-js'
import logo from '../../../assets/brand/logo.png'
import { useI18n } from '../../../i18n'

const SecondFooter: Component = () => {
  const { t, locale } = useI18n()

  const lastBuildDate = () => new Date(__BUILD_DATE__).toLocaleString(locale())

  return (
    <div class="site-footer-meta">
      <div class="site-footer-brand">
        <img src={logo} alt="logo" width="40" height="40" />
        <div>
          <h3>Gmod Integration</h3>
          <p>
            {t(
              'footer.disclaimer',
              'This service is not affiliated with Discord, Steam, or any other platform or games.',
            )}
          </p>
        </div>
      </div>
      <div class="site-footer-build">{t('footer.last_build_date', 'Last build date') + `: ${lastBuildDate()}`}</div>
    </div>
  )
}

export default SecondFooter
