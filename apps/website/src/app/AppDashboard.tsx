import DashboardMiddleware from '../middleware/DashboardMiddleware'
import { DashboardMenu } from '../components/layout/menu/DashboardMenu'
import { AddErrorComponent, ShowErrorList } from '../components/layout/Errors'
import { ErrorBoundary } from 'solid-js/web'
import { ParentProps } from 'solid-js'

export const AppDashboard = (props: ParentProps) => (
  <>
    <DashboardMiddleware />
    <div class="grow shrink-0 flex-auto flex h-full w-full">
      <DashboardMenu />
      <div class="flex flex-col w-full max-w-(--breakpoint-2xl) mx-auto p-4 gap-4">
        <ShowErrorList />

        <ErrorBoundary
          fallback={(err) => (
            // Deliberately not re-rendering `props.children` here: `children` is a live getter
            // that re-invokes the same page component that just threw, which throws again
            // synchronously during the fallback's own render - uncaught, since the fallback isn't
            // itself wrapped in a boundary. That defeats the whole purpose of this ErrorBoundary
            // (crashing the tree instead of showing the error). Confirmed with a minimal repro.
            <AddErrorComponent message={err.message} />
          )}
        >
          {props.children}
        </ErrorBoundary>
      </div>
    </div>
  </>
)
