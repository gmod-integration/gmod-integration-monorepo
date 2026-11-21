import { ErrorBoundary, type ParentComponent } from 'solid-js'
import { AdminMenu } from '../components/layout/menu/AdminMenu.js'
import { AddErrorComponent, ShowErrorList } from '../components/layout/Errors.js'
import { useI18n } from '../i18n.js'
import { Button } from '../components/ui/index.js'
import { DashboardPageHeader } from './AppDashboard.js'

export const AppAdminDashboard: ParentComponent = (props) => {
  const { t } = useI18n()
  return (
    <div class="dashboard-shell">
      <AdminMenu />
      <div class="dashboard-main">
        <DashboardPageHeader admin />
        <div class="dashboard-content">
          <ShowErrorList />
          <ErrorBoundary
            fallback={(error, reset) => (
              <div class="flex flex-col gap-2">
                <AddErrorComponent message={error instanceof Error ? error.message : String(error)} />
                <Button class="self-start" onClick={reset}>
                  {t('ui.retry', 'Try again')}
                </Button>
              </div>
            )}
          >
            {props.children}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  )
}
