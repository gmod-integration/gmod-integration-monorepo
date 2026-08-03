import { Component } from 'solid-js'
import logo from '../../../assets/brand/logo.png'
import { useI18n } from '../../../i18n'

const SecondFooter: Component = () => {
  const { t } = useI18n()

  // toLocaleString() on a Date always returns a non-empty string (even "Invalid Date"), so the
  // `localChained.unknown()` fallback this used to have was unreachable dead code referencing an
  // undefined identifier - removed.
  const lastBuildDate = new Date(__BUILD_DATE__).toLocaleString()

  return (
    <footer class="footer md:footer-horizontal px-10 py-4 bg-base-100 text-base-content max-w-(--breakpoint-2xl) mx-auto">
      <aside class="items-center grid-flow-col">
        <img src={logo} alt="logo" width="40" height="40" />
        <div class="ml-2 flex flex-col">
          <h3 class="text-base-content font-bold">Gmod Integration</h3>
          <p class="text-base-content/50">
            {t(
              'footer.disclaimer',
              'This service is not affiliated with Discord, Steam, or any other platform or games.',
            )}
          </p>
        </div>
      </aside>
      <div class="grow" />
      <div class="flex gap-2 text-right h-full items-center text-base-content/50">
        {t('footer.last_build_date', 'Last build date') + `: ${lastBuildDate}`}
      </div>
    </footer>
  )
}

export default SecondFooter
