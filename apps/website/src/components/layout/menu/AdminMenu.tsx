import { Component, createEffect, createSignal, For, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";

import { getUrlWithActualParams } from "../../../utils/api";

const linksData = [
  {
    name: "Admin",
    condition: (url: string) => !url.includes("/servers/"),
    back: "/dashboard/admins",
    content: [
      {
        label: "Informations",
        emoji: "fa-info",
        url: "/dashboard/admins/informations",
      },
      {
        label: "Guilds",
        emoji: "fa-server",
        url: "/dashboard/admins/guilds",
      },
      {
        label: "Users",
        emoji: "fa-user",
        url: "/dashboard/admins/users",
      },
      {
        label: "Errors",
        emoji: "fa-bug",
        url: "/dashboard/admins/errors",
      },
      {
        label: "Logs",
        emoji: "fa-scroll",
        url: "/dashboard/admins/logs",
      },
      {
        label: "Impersonate",
        emoji: "fa-user-secret",
        url: "/dashboard/admins/impersonate",
      },
    ],
  },
];

class navLink {
  emoji: string;
  label: string;
  url: string;
  current?: boolean;

  constructor(emoji: string, label: string, url: string, current?: boolean) {
    this.emoji = emoji;
    this.label = label;
    this.url = url;
    this.current = current;
  }
}

export const AdminMenu: Component = () => {
  const [onlyShowEmoji, setOnlyShowEmoji] = createSignal(false);
  const [hoverExpand, setHoverExpand] = createSignal(false);
  const [backUrl, setBackUrl] = createSignal("/dashboard/guilds");
  const [actualLinksData, setActualLinksData] = createSignal([] as navLink[]);

  function refreshLinks(pathname: string) {
    linksData.forEach((category) => {
      if (category.condition(pathname)) {
        setBackUrl(category.back);
        setActualLinksData(
          category.content.map(
            (link) => new navLink(link.emoji, link.label, link.url, getUrlWithActualParams(link.url) === pathname),
          ),
        );
      }
    });
  }

  const location = useLocation();
  createEffect(() => {
    refreshLinks(location.pathname);
  }, [location.pathname]);

  return (
    <>
      <div
        class="flex flex-col p-4 gap-2"
        classList={{
          "min-w-[240px]": !onlyShowEmoji() || hoverExpand(),
        }}
        onMouseEnter={() => setHoverExpand(true)}
        onMouseLeave={() => setHoverExpand(false)}
      >
        <div class="flex items-center p-2 gap-4">
          <div class="flex justify-center items-center min-w-6 min-h-6">
            <i class="fa-solid fa-screwdriver-wrench"></i>
          </div>
          <Show when={!onlyShowEmoji() || hoverExpand()}>Admin</Show>
        </div>

        <hr class="border border-base-200" />

        <For each={actualLinksData()}>
          {(link) => (
            <A
              href={getUrlWithActualParams(link.url)}
              class="flex items-center gap-4 p-2 rounded-md"
              classList={{
                "bg-base-200": link.current,
              }}
            >
              <div class="flex justify-center items-center min-w-6 min-h-6">
                <i class={`fa-solid ${link.emoji}`}></i>
              </div>
              <span
                classList={{
                  visible: !onlyShowEmoji() || hoverExpand(),
                  hidden: onlyShowEmoji() && !hoverExpand(),
                }}
              >
                {link.label}
              </span>
            </A>
          )}
        </For>

        <div class="flex flex-col mt-auto hover:cursor-pointer" onClick={() => setOnlyShowEmoji(!onlyShowEmoji())}>
          <hr class="border border-base-200 mb-4" />
          <div class="flex items-center p-2 gap-4 hover:font-bold">
            <div class="flex justify-center items-center min-w-6 min-h-6">
              <i
                class="fa-solid"
                classList={{
                  "fa-angle-double-right": onlyShowEmoji(),
                  "fa-angle-double-left": !onlyShowEmoji(),
                }}
              ></i>
            </div>
            {!onlyShowEmoji() ? <span>Collapse</span> : hoverExpand() ? <span>Expand</span> : ""}
          </div>
        </div>
      </div>
      <div class="border border-base-200" />
    </>
  );
};
