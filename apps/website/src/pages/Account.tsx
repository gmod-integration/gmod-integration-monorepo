import { Component, createResource, createSignal, For, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import { getDiscordUser } from "../utils/utils";
import DashboardMiddleware from "../middleware/DashboardMiddleware";
import { useI18n } from "../i18n";
import { Errors, ShowErrorList } from "../components/layout/Errors";
import { fetchAPI, getAPIUrl, getUrlWithActualParams } from "../utils/api";

const fetchUser = async () => {
  const response = await fetchAPI("/users?discordID=" + getDiscordUser().id, "GET");
  return await response.json();
};

const Account: Component = () => {
  const { t } = useI18n();

  const [localUser] = createSignal<any>(getDiscordUser());
  const [user, { refetch: refetchUser }] = createResource("steamUser", fetchUser);
  const [showRequestLoading, setShowRequestLoading] = createSignal(false);

  const getVerificationToken = async () => {
    const response = await fetchAPI("/users/:discordID/verifications/token", "GET");
    if (!response.ok) return;
    const json = await response.json();
    window.location.href = getUrlWithActualParams(`${getAPIUrl(false)}/steam?verificationCode=${json.token}`);
  };

  const [gmodStorePurchase, { refetch: refetchGmodStorePurchase }] = createResource("gmodStorePurchase", async () => {
    return await fetchAPI("/users/:discordID/gmod-store", "GET").then((res) => res.json() || {});
  });

  const [userDataRequest, { mutate: mutateUserDataRequest }] = createResource("userDataRequest", async () => {
    return await fetchAPI("/users/:discordID/data-requests", "GET").then((res) => res.json() || {});
  });

  const [userSessions, { mutate: mutateUserSessions }] = createResource("userSessions", async () => {
    return await fetchAPI("/users/:discordID/sessions", "GET").then((res) => res.json() || {});
  });

  function deleteUserSession(sessionID: string) {
    fetchAPI(`/users/:discordID/sessions/${sessionID}`, "DELETE").then(async (res) => {
      if (res.ok) {
        mutateUserSessions((prev) => prev.filter((session) => session.id !== sessionID));
      }
    });
  }

  function userDataRequestCreate() {
    let edited = false;
    setTimeout(() => {
      if (edited) return;
      setShowRequestLoading(true);
    }, 500);
    fetchAPI("/users/:discordID/data-requests", "POST").then(async (res) => {
      const json = await res.json();
      edited = true;
      setShowRequestLoading(false);
      if (res.ok) {
        mutateUserDataRequest((prev) => [...prev, json]);
      } else {
        Errors(json.error || t("account.error_create_data_request", "Failed to create the data request"));
      }
    });
  }

  onMount(async () => {
    if (window.location.href.includes("startVerification")) {
      await getVerificationToken();
    }
  });

  return (
    <>
      <DashboardMiddleware />
      <div class="flex flex-col p-4 gap-4 max-w-(--breakpoint-xl) mx-auto w-full">
        <h2 class="text-2xl py-4 font-bold">{t("account.title", "Account")}</h2>

        <ShowErrorList />

        <div class="border border-base-200 rounded-lg">
          <div class="flex flex-col gap-4 p-4">
            <h2 class="text-lg font-bold">{t("account.discord", "Discord")}</h2>
            <p class="text-base-content/50">
              {t("account.id", "ID")}: <span class="font-bold">{localUser().id}</span>
            </p>
          </div>
        </div>

        <div class="border border-base-200 rounded-lg">
          <div class="flex flex-col gap-4 p-4">
            <h2 class="text-lg font-bold">{t("account.steam", "Steam")}</h2>
            <Show
              when={user() && user().steamID64}
              fallback={
                <Show when={user()} fallback={<span class="loading loading-spinner loading-lg"></span>}>
                  <div class="flex flex-raw gap-4">
                    <button class="btn btn-base-200" onClick={getVerificationToken}>
                      {t("account.link_steam_account", "Link Steam Account")}
                    </button>
                  </div>
                </Show>
              }
            >
              <p class="text-base-content/50">
                {t("account.id", "ID")}: <span class="font-bold">{user().steamID64}</span>
              </p>
            </Show>
          </div>
        </div>

        <div class="border border-base-200 rounded-lg">
          <div class="flex flex-col gap-4 p-4">
            <h2 class="text-lg font-bold">{t("account.gmodstore_purchase", "Gmod Store Purchase")}</h2>
            <p class="text-base-content/50">
              {t("account.gmodstore_purchase_description", "Manage your premium bought on Gmod Store.")}
            </p>
            <Show when={!gmodStorePurchase.loading} fallback={<span class="loading loading-spinner loading-lg"></span>}>
              <div class="flex flex-raw gap-4">
                <Show
                  when={!gmodStorePurchase().revoke}
                  fallback={
                    <A href="/gmodstore" class="btn btn-base-200">
                      {t("account.buy_premium", "Buy Premium")}
                    </A>
                  }
                >
                  <Show
                    when={gmodStorePurchase().guild}
                    fallback={
                      <A href="/dashboard/guilds" class="btn btn-base-200">
                        {t("account.activate_on_guild", "Activate on Guild")}
                      </A>
                    }
                  >
                    <p class="text-base-content/50">
                      {t("account.activate_on_guild", "Activate on Guild")}:{" "}
                      <span class="font-bold">{gmodStorePurchase().guild}</span>
                    </p>
                  </Show>
                </Show>
              </div>
            </Show>
          </div>
        </div>

        <div class="border border-base-200 rounded-lg">
          <div class="flex flex-col gap-4 p-4">
            <h2 class="text-lg font-bold">{t("account.manage_sessions", "Manage Sessions")}</h2>
            <p class="text-base-content/50">
              {t("account.manage_sessions_description", "Manage your active sessions.")}
            </p>
            <div class="border border-base-200 rounded-lg">
              <h4 class="text-md font-bold p-4">{t("account.active_sessions", "Active Sessions")}</h4>
              <table class="table noBorderBottomTable">
                <thead>
                  <tr class="text-l">
                    <th>{t("account.session_id", "Session ID")}</th>
                    <th>{t("account.session_date", "Session Date")}</th>
                    <th>{t("account.ip", "IP")}</th>
                    <th>{t("account.os", "OS")}</th>
                    <th>{t("account.browser", "Browser")}</th>
                    <th>{t("account.country", "Country")}</th>
                    <th class="text-center">{t("account.actions", "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  <Show
                    when={!userSessions.loading}
                    fallback={<span class="loading loading-spinner loading-lg"></span>}
                  >
                    <For each={userSessions()}>
                      {(session) => (
                        <tr>
                          <td>{session.id.substring(0, 8)}</td>
                          <td>{new Date(session.updatedAt).toLocaleString().split(",")[0]}</td>
                          <td>{session.ip}</td>
                          <td>{session.os}</td>
                          <td>{session.browser}</td>
                          <td>{session.country}</td>
                          <td class="text-center">
                            <Show
                              when={session.accessToken === localStorage.getItem("accessToken")}
                              fallback={
                                <div
                                  class="tooltip tooltip-base-200"
                                  data-tip={t("account.delete_session", "Delete this session")}
                                >
                                  <i
                                    class="fa-solid cursor-pointer text-error fa-trash"
                                    onClick={() => deleteUserSession(session.id)}
                                  ></i>
                                </div>
                              }
                            >
                              <div
                                class="tooltip tooltip-base-200"
                                data-tip={t("account.current_session", "Current Session")}
                              >
                                <i class="fa-solid fa-user-check text-success"></i>
                              </div>
                            </Show>
                          </td>
                        </tr>
                      )}
                    </For>
                  </Show>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="border border-base-200 rounded-lg">
          <div class="flex flex-col gap-4 p-4">
            <h2 class="text-lg font-bold">{t("account.manage_data", "Manage Data")}</h2>
            <p class="text-base-content/50">
              {t("account.manage_data_description", "In compliance with GDPR, you can request or delete your data.")}
            </p>
            <div class="border border-base-200 rounded-lg">
              <h4 class="text-md font-bold p-4">{t("account.data_requests", "Data Requests")}</h4>
              <table class="table noBorderBottomTable">
                <thead>
                  <tr class="text-l">
                    <th class="w-1/5">{t("account.request_date", "Request Date")}</th>
                    <th class="w-1/5">{t("account.expiration_date", "Expiration Date")}</th>
                    <th class="w-1/5">{t("account.status", "Status")}</th>
                    <th class="w-1/6 text-center">{t("account.actions", "Actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={userDataRequest()}>
                    {(request) => (
                      <tr>
                        <td class="w-1/5">{new Date(request.createdAt).toLocaleString()}</td>
                        <td class="w-1/5">{new Date(request.expirationDate).toLocaleString()}</td>
                        <td class="w-1/5">
                          {new Date(request.expirationDate) > new Date()
                            ? t("account.active", "Active")
                            : t("account.expired", "Expired")}
                        </td>
                        <td class="w-1/6 text-center">
                          <Show
                            when={new Date(request.expirationDate) > new Date()}
                            fallback={
                              <div
                                class="tooltip tooltip-error"
                                data-tip={t("account.request_expired", "Request has expired")}
                              >
                                <i class="fa-solid fa-download text-error"></i>
                              </div>
                            }
                          >
                            <div
                              class="tooltip tooltip-base-200"
                              data-tip={t("account.download_data", "Download your data")}
                            >
                              <i
                                class="fa-solid cursor-pointer fa-download"
                                onClick={() => window.open(`${request.downloadLink}?code=${request.code}`)}
                              ></i>
                            </div>
                          </Show>
                        </td>
                      </tr>
                    )}
                  </For>
                  <Show when={showRequestLoading()}>
                    <tr>
                      <td colspan="4" class="text-center">
                        <h4>{t("account.loading_message", "Depends on your data size, this can take a while.")}</h4>
                        <progress class="progress w-1/2 my-auto" max="60"></progress>
                      </td>
                    </tr>
                  </Show>
                </tbody>
              </table>
            </div>
            <div class="flex flex-raw gap-4">
              <button class="btn btn-base-200" onClick={userDataRequestCreate}>
                {t("account.request_my_data", "Request my Data")}
              </button>
              <a href="mailto:contact@gmod-integration.com" class="btn btn-warning">
                {t("account.delete_my_data", "Delete my Data")}
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Account;
