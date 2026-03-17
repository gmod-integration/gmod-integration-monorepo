import { Component, createEffect, createResource, createSignal, For, onMount, Show } from "solid-js";
import { fetchAPI } from "../../../../../utils/api";
import { useI18n } from "../../../../../i18n";
import AdminPanel from "../../../../../components/AdminPanel";
import { setWebSocketLogsMessages, webSocketLogsMessages } from "../../../../../utils/websocket";
import { AddLogComponent } from "./ListLog";

import { ClientQuery, QuerySort, ServerQuery } from "../../../../../utils/types/QueryTypes";
import Pagination from "../../../../../components/Pagination";
import { premium } from "../../../../../utils/premium";

interface Log {
  id: number;
  serverID: string;
  type: string;
  data: string;
  createdAt: string;
}

interface LogsData {
  logs: Log[];
  query: ServerQuery;
}

export const ServerLogsList: Component = () => {
  const { t } = useI18n();

  const [query, setQuery] = createSignal<ClientQuery>({
    limit: 25,
    offset: 0,
    sort: "createdAt",
    orderBy: QuerySort.DESC,
  });

  async function fetchLogs(q: ClientQuery) {
    const res = await fetchAPI(
      `/users/:discordID/guilds/:guildID/servers/:serverID/logs` +
        `?offset=${q.offset}` +
        `&limit=${q.limit}` +
        `&sort=${q.sort}` +
        `&orderBy=${q.orderBy}`,
      "GET",
    );

    if (!res.ok) {
      throw new Error("Failed to fetch logs");
    }

    let data = (await res.json()) as LogsData;
    if (!premium()) {
      if (data.query.total > 500) {
        data.query.total = 500;
        data.logs = data.logs.slice(0, 500);
      }
    }

    return data;
  }

  const [logs] = createResource(query, fetchLogs, {
    // Provide initialValue so warnsData() is never undefined
    initialValue: {
      logs: [],
      query: {
        ...query(),
        total: 0,
      },
    },
  });

  // reset wslogsmessage on page display setWebSocketLogsMessages([]);
  onMount(() => {
    setWebSocketLogsMessages([]);
  });

  // on change of query reset wslogsmessage
  createEffect(() => {
    query();
    setWebSocketLogsMessages([]);
  });

  return (
    <AdminPanel
      title={t("dashboard.server.logs.title.logs", "Logs")}
      description={t("dashboard.server.logs.description.logs", "Watch the logs of your server.")}
      type="none"
      premium={t("dashboard.server.logs.premium", "Limited to 500 last logs for free users.")}
    >
      <table class="table">
        <thead>
          <tr class="text-l">
            <th class="w-1/5">{t("dashboard.server.logs.table_headers.date", "Date")}</th>
            <th class="w-1/5">{t("dashboard.server.logs.table_headers.category", "Category")}</th>
            <th>{t("dashboard.server.logs.table_headers.log", "Log")}</th>
            <th class="w-1/6 text-center">{t("dashboard.server.logs.table_headers.actions", "Actions")}</th>
          </tr>
        </thead>
        <tbody class="max-w-40">
          <Show when={!logs.loading} fallback={<span class="loading loading-lg"></span>}>
            <Show when={query().offset === 0}>
              <For each={webSocketLogsMessages()}>
                {(parsedMsg) => {
                  return <AddLogComponent data={parsedMsg.data} category={parsedMsg.type} createAt={new Date()} />;
                }}
              </For>
            </Show>
            <For each={logs().logs}>
              {(log) => <AddLogComponent data={log.data} category={log.type} createAt={new Date(log.createdAt)} />}
            </For>
            <Pagination query={query()} total={logs().query.total} onChange={setQuery} colSpan={4} />
          </Show>
        </tbody>
      </table>
    </AdminPanel>
  );
};
