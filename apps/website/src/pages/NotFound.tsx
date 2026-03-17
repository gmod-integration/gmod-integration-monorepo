import { Component, Match, Switch } from "solid-js";
import { isRedirecting } from "../middleware/redirection";
import { A } from "@solidjs/router";

const NotFound: Component = () => {
  console.log(isRedirecting());
  return (
    <div class="flex flex-col items-center justify-center gap-6 my-auto w-full">
      <Switch>
        <Match when={isRedirecting() != ""}>
          <h1 class="text-2xl font-bold">Redirecting...</h1>
          <A href={isRedirecting()} class="link text-xl">Click here if you are not redirected.</A>
        </Match>
        <Match when={isRedirecting() == ""}>
          <h1 class="text-6xl font-bold">404</h1>
          <p class="text-xl">The page you are looking for does not exist.</p>
        </Match>
      </Switch>
    </div>
  );
};

export default NotFound;