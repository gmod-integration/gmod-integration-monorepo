import { ErrorBoundary, type ParentComponent } from 'solid-js'
import DashboardMiddleware from '../middleware/DashboardMiddleware.js'
import { DashboardMenu } from '../components/layout/menu/DashboardMenu.js'
import { AddErrorComponent, ShowErrorList } from '../components/layout/Errors.js'
import { useI18n } from '../i18n.js'

export const AppDashboard: ParentComponent = (props) => {
  const { t } = useI18n()
  return (
    <>
      <DashboardMiddleware />
      <div class="grow shrink-0 flex-auto flex flex-col md:flex-row h-full w-full min-w-0">
        <DashboardMenu />
        <div class="flex flex-col w-full min-w-0 max-w-(--breakpoint-2xl) mx-auto p-4 gap-4">
          <ShowErrorList />
          <ErrorBoundary
            fallback={(error, reset) => (
              <div class="flex flex-col gap-2">
                <AddErrorComponent message={error instanceof Error ? error.message : String(error)} />
                <button type="button" class="btn btn-outline self-start" onClick={reset}>
                  {t('ui.retry', 'Try again')}
                </button>
              </div>
            )}
          >
            {props.children}
          </ErrorBoundary>
        </div>
      </div>
    </>
  )
}
