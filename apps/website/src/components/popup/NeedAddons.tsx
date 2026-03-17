import { Component, For, ParentProps } from "solid-js";
import { useI18n } from "../../i18n";
import { A } from "@solidjs/router";

export interface AddonLink {
  name: string;
  link: string;
}

interface NeedAddonsProps extends ParentProps {
  addons: AddonLink[];
}

export const NeedAddon: Component<NeedAddonsProps> = (props: NeedAddonsProps) => {
  const { t } = useI18n();
  return (
    <>
      <div class="text-info flex h-12 items-center rounded-lg border-info border p-4 gap-4">
        <i class="fa-solid fa-info-circle"></i>
        <span>
          {t("tools.needAddon", "To use this feature you need to install the addon(s): ")}
          <For each={props.addons}>
            {(addon) => (
              <>
                <A class="link" href={addon.link}>
                  {addon.name}
                </A>
                {", "}
              </>
            )}
          </For>
          {t("tools.needAddon2", " to work properly.")}
        </span>
      </div>
    </>
  );
};