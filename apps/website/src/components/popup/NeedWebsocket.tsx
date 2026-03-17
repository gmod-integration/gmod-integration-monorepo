import { Component } from "solid-js";
import { useI18n } from "../../i18n";
import { A } from "@solidjs/router";

export const NeedWebsocket: Component = () => {
  const { t } = useI18n();
  return (
    <>
      <div class="text-info flex h-12 items-center rounded-lg border-info border p-4 gap-4">
        <i class="fa-solid fa-info-circle"></i>
        <span>
          {t("tools.needWS_1", "This feature requires a") + " "}
          <A class="link" href="https://docs.gmod-integration.com/getting-started/installation#dll">
            GWSocket
          </A>{" "}
          {t("tools.needWS_2", "connection to work properly.") + " "}
        </span>
      </div>
    </>
  );
};
