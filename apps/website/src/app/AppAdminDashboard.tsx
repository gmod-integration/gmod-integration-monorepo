import { AdminMenu } from '../components/layout/menu/AdminMenu'
import { ErrorBoundary } from 'solid-js/web'
import { ParentProps } from 'solid-js'

export const AppAdminDashboard = (props: ParentProps) => (
  <>
    <div class="grow shrink-0 flex-auto flex h-full w-full">
      <AdminMenu />
      <div class="flex flex-col w-full max-w-(--breakpoint-2xl) mx-auto p-4 gap-4">
        <ErrorBoundary
          fallback={(err, reset) => (
            <>
              <div class="text-error flex h-12 items-center rounded-lg border-error border p-4 gap-4">
                <i class="fa-regular fa-circle-xmark"></i>
                <span>Error : {err.message}</span>
              </div>
              {props.children}
            </>
          )}
        >
          {props.children}
        </ErrorBoundary>
      </div>
    </div>
  </>
)
