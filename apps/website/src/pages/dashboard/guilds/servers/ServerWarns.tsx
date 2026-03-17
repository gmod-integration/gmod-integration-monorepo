// ServerWarns.tsx
import { Component, createResource, createSignal, For, Show } from "solid-js";
import AdminPanel from "../../../../components/AdminPanel";
import { useI18n } from "../../../../i18n";
import Pagination from "../../../../components/Pagination";
import { ClientQuery, QuerySort, ServerQuery } from "../../../../utils/types/QueryTypes";
import { NeedAddon } from "../../../../components/popup/NeedAddons";
import { fetchAPI } from "../../../../utils/api";

interface Warn {
  id: number;
  serverID: string;
  userSteamID64: string;
  adminSteamID64: string;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

interface WarnResponse {
  warns: Warn[];
  query: ServerQuery;
}

const ServerWarns: Component = () => {
  const { t } = useI18n();

  // 1) Our local query state (offset, limit, sort, orderBy)
  // Omit 'total' so that setting it doesn't re-fetch
  const [query, setQuery] = createSignal<ClientQuery>({
    limit: 25,
    offset: 0,
    sort: "createdAt",
    orderBy: QuerySort.DESC,
  });

  // 2) The fetcher uses your query to form the request
  async function fetchWarns(q: ClientQuery) {
    const res = await fetchAPI(
      `/users/:discordID/guilds/:guildID/servers/:serverID/warns` +
        `?offset=${q.offset}` +
        `&limit=${q.limit}` +
        `&sort=${q.sort}` +
        `&orderBy=${q.orderBy}`,
      "GET",
    );

    if (!res.ok) {
      throw new Error("Failed to fetch warns");
    }
    return (await res.json()) as WarnResponse;
  }

  // 3) Create the resource, bound to the 'query' signal
  const [warnsData] = createResource(query, fetchWarns, {
    // Provide initialValue so warnsData() is never undefined
    initialValue: {
      warns: [],
      query: {
        ...query(),
        total: 0,
      },
    },
  });

  return (
    <>
      <NeedAddon
        addons={[
          {
            name: "AWarn3",
            link: "https://www.gmodstore.com/market/view/awarn3-warning-system",
          },
        ]}
      />
      <AdminPanel
        title={t("dashboard.server.warns.title", "Warns")}
        description={t("dashboard.server.warns.description", "List of all warns on your server")}
        type="none"
      >
        <table class="table">
          <thead>
            <tr class="text-l">
              <th>{t("dashboard.server.date", "Date")}</th>
              <th>{t("dashboard.server.admin", "Admin")}</th>
              <th>{t("dashboard.server.player", "Player")}</th>
              <th>{t("dashboard.server.reason", "Reason")}</th>
            </tr>
          </thead>
          <tbody>
            <Show
              when={!warnsData.loading}
              fallback={
                <td colSpan={4}>
                  <div class="flex w-full justify-center items-center">
                    <span class="loading loading-lg" />
                  </div>
                </td>
              }
            >
              {/* RENDER WARNS ROWS */}
              <For each={warnsData().warns}>
                {(warn) => (
                  <tr>
                    <td class="w-1/6 text-base-content/70 text-nowrap">{new Date(warn.createdAt).toLocaleString()}</td>
                    <td class="w-1/8 text-nowrap">{warn.adminSteamID64}</td>
                    <td class="w-1/8 text-nowrap">{warn.userSteamID64}</td>
                    <td class="wrap-break-word">{warn.reason}</td>
                  </tr>
                )}
              </For>

              {/* PAGINATION ROW */}
              <Pagination query={query()} total={warnsData().query.total} onChange={setQuery} colSpan={4} />
            </Show>
          </tbody>
        </table>
      </AdminPanel>
    </>
  );
};

export default ServerWarns;
