import { AdminMenu } from '../components/layout/menu/AdminMenu'
import { ErrorBoundary } from 'solid-js/web'
import { ParentProps } from 'solid-js'

export const AppAdminDashboard = (props: ParentProps) => (
  <>
    <div class="grow shrink-0 flex-auto flex h-full w-full">
      <AdminMenu />
      <div class="flex flex-col w-full max-w-(--breakpoint-2xl) mx-auto p-4 gap-4">
        <ErrorBoundary
          fallback={(err) => (
            // See AppDashboard.tsx for why `props.children` is deliberately not re-rendered here:
            // it's a live getter that re-invokes the same throwing child, uncaught, during the
            // fallback's own render.
            <div class="text-error flex h-12 items-center rounded-lg border-error border p-4 gap-4">
              <i class="fa-regular fa-circle-xmark"></i>
              <span>Error : {err.message}</span>
            </div>
          )}
        >
          {props.children}
        </ErrorBoundary>
      </div>
    </div>
  </>
)
