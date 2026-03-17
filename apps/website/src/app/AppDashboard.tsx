import DashboardMiddleware from "../middleware/DashboardMiddleware";
import { DashboardMenu } from "../components/layout/menu/DashboardMenu";
import { AddErrorComponent, ShowErrorList } from "../components/layout/Errors";
import { ErrorBoundary } from "solid-js/web";
import { ParentProps } from "solid-js";

export const AppDashboard = (props: ParentProps) => (
  <>
    <DashboardMiddleware />
    <div class="grow shrink-0 flex-auto flex h-full w-full">
      <DashboardMenu />
      <div class="flex flex-col w-full max-w-(--breakpoint-2xl) mx-auto p-4 gap-4">
        <ShowErrorList />

        <ErrorBoundary
          fallback={(err, reset) => (
            <>
              <AddErrorComponent message={err.message} />
              {props.children}
            </>
          )}
        >
          {props.children}
        </ErrorBoundary>
      </div>
    </div>
  </>
);
