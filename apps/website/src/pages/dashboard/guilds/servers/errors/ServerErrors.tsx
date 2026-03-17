import { Component, createResource, createSignal, For, ParentProps, Show } from "solid-js";
import AdminPanel from "../../../../../components/AdminPanel";
import { useI18n } from "../../../../../i18n";
import JsonViewer from "../../../../../components/JsonViewer";
import { fetchAPI } from "../../../../../utils/api";
import { ClientQuery, QuerySort, ServerQuery } from "../../../../../utils/types/QueryTypes";
import Pagination from "../../../../../components/Pagination";
import { premium } from "../../../../../utils/premium";

interface ErrorsSchema {
  serverID: string;
  count: number;
  realm: string;
  error: string;
  stack: string;
  name: string;
  steamID64: string;
  workshopID: string;
  uptime: number;
  createdAt: string;
  updatedAt: string;
}

interface ErrorsData {
  errors: ErrorsSchema[];
  query: ServerQuery;
}

interface AddErrorProps extends ParentProps {
  error: ErrorsSchema;
}

const [selectError, setSelectError] = createSignal(0);
let idxLog = 0;
const AddErrorComponent: Component<AddErrorProps> = (props) => {
  const { t } = useI18n();

  props.error.stack = JSON.parse(props.error.stack || "[]");

  const errorContentStr = JSON.stringify(props.error, null, 2).split("\n");
  idxLog++;

  const localIdxLog = idxLog;
  return (
    <>
      <tr>
        <td class="text-base-content/70 text-nowrap">{new Date(props.error.createdAt).toLocaleString()}</td>
        <td
          classList={{
            "text-sky-500": props.error.realm === "client",
            "text-yellow-500": props.error.realm === "server",
          }}
        >
          {props.error.realm}
        </td>
        <td class="">{props.error.count}</td>
        <td class=" text-nowrap">{props.error.name}</td>
        <td class=" wrap-break-word">{props.error.error}</td>
        <td>
          <div class="flex gap-2 justify-center">
            <div
              class="tooltip tooltip-info"
              data-tip={t("dashboard.server.errors.actions.view_details", "View Details")}
              onClick={() => {
                if (selectError() === localIdxLog) {
                  setSelectError(0);
                } else {
                  setSelectError(localIdxLog);
                }
              }}
            >
              <Show when={selectError() === localIdxLog}>
                <i class="fa-solid fa-chevron-up"></i>
              </Show>
              <Show when={selectError() !== localIdxLog}>
                <i class="fa-solid fa-chevron-down"></i>
              </Show>
            </div>
            <Show when={props.error.workshopID !== "" && props.error.workshopID !== "0"}>
              <div
                class="tooltip tooltip-info"
                data-tip={t("dashboard.server.errors.actions.open_workshop", "Open Workshop")}
              >
                <a
                  href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${props.error.workshopID}`}
                  target="_blank"
                >
                  <i class="fa-solid fa-external-link-alt"></i>
                </a>
              </div>
            </Show>
            <div class="tooltip tooltip-info" data-tip={t("dashboard.server.errors.actions.download", "Download")}>
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(errorContentStr.join("\n"))}`}
                download={`log-${props.error.createdAt.toLocaleString()}.json`}
              >
                <i class="fa-solid fa-download"></i>
              </a>
            </div>
          </div>
        </td>
      </tr>

      <Show when={selectError() === localIdxLog}>
        <tr>
          <td colSpan="6" class="p-0">
            <pre class="hljs p-4">
              <JsonViewer data={props.error} />
            </pre>
          </td>
        </tr>
      </Show>
    </>
  );
};

const ServerErrors: Component = () => {
  const [query, setQuery] = createSignal<ClientQuery>({
    limit: 25,
    offset: 0,
    sort: "createdAt",
    orderBy: QuerySort.DESC,
  });

  async function fetchErrors(q: ClientQuery) {
    const res = await fetchAPI(
      `/users/:discordID/guilds/:guildID/servers/:serverID/errors` +
        `?offset=${q.offset}` +
        `&limit=${q.limit}` +
        `&sort=${q.sort}` +
        `&orderBy=${q.orderBy}`,
      "GET",
    );

    if (!res.ok) {
      throw new Error("Failed to fetch errors");
    }

    let data = (await res.json()) as ErrorsData;

    if (!premium()) {
      if (data.query.total > 50) {
        data.query.total = 50;
        data.errors = data.errors.slice(0, 50);
      }
    }

    return data;
  }

  const [errors] = createResource(query, fetchErrors, {
    initialValue: {
      errors: [],
      query: {
        ...query(),
        total: 0,
      },
    },
  });

  const { t } = useI18n();

  return (
    <>
      <AdminPanel
        title={t("dashboard.server.errors.title", "Errors")}
        description={t("dashboard.server.errors.description", "Watch the errors of your server.")}
        type="none"
        premium={t("dashboard.server.errors.premium", "Limited to 50 last errors for free users.")}
      >
        <table class="table">
          <thead>
            <tr class="text-l">
              <th class="w-1/6">{t("dashboard.server.errors.error_details.timestamp", "Date")}</th>
              <th class="w-1/12">{t("dashboard.server.errors.error_details.realm", "Realm")}</th>
              <th class="w-1/12">{t("dashboard.server.errors.error_details.count", "Count")}</th>
              <th class="w-1/6">{t("dashboard.server.errors.error_details.addon", "Addon")}</th>
              <th class="w-1/3">{t("dashboard.server.errors.error_details.message", "Message")}</th>
              <th class="w-1/12 text-center">{t("dashboard.server.errors.actions.actions", "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            <Show
              when={!errors.loading}
              fallback={
                <span class="loading loading-lg">{t("dashboard.server.errors.loading", "Loading errors...")}</span>
              }
            >
              <For each={errors().errors}>{(errorData) => <AddErrorComponent error={errorData} />}</For>
            </Show>
            <Pagination query={query()} total={errors().query.total} onChange={setQuery} colSpan={6} />
          </tbody>
        </table>
      </AdminPanel>
    </>
  );
};

export default ServerErrors;
