import { Component, createSignal, Show } from "solid-js";
import { useI18n } from "../../i18n";
import { A } from "@solidjs/router";

import { premium } from "../../utils/premium";

export const PremiumFeature: Component = (props: any) => {
  const [guildIsPremium] = createSignal(premium());
  const { t } = useI18n();
  return (
    <>
      <Show when={!guildIsPremium()}>
        <div class="text-warning flex items-center rounded-lg border-warning border py-2 px-4 gap-4">
          <i class="fa-solid fa-crown"></i>
          <span>
            {props.message ? props.message : "This feature requires a premium plan."}{" "}
            <A class="link" href="/premium">
              {t("tools.upgrade_now", "Upgrade Now")}
            </A>
          </span>
        </div>
      </Show>
    </>
  );
};
