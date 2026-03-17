import { Component, createResource, For, Show } from "solid-js";
import DashboardMiddleware from "../middleware/DashboardMiddleware";
import defaultServer from "../assets/defaultServer.png";
import { useI18n } from "../i18n";
import { fetchAPI } from "../utils/api";

const fetchServer = async () => {
  const response = await fetchAPI("/users/:discordID/servers", "GET");
  return await response.json();
};

const Servers: Component = () => {
  const { t } = useI18n();
  const [fetchServers] = createResource<any>("publicServers", fetchServer);

  return (
    <>
      <DashboardMiddleware />
      <div class="flex flex-col p-4 gap-4 max-w-(--breakpoint-xl) mx-auto w-full">
        <h2 class="text-2xl py-4 font-bold">{t("servers.title", "Servers")}</h2>

        <Show when={!fetchServers.loading} fallback={<span class="loading loading-lg"></span>}>
          <For each={fetchServers().sort((a, b) => b.vote - a.vote)}>
            {(server) => (
              <div class="border border-base-200 rounded-lg flex gap-4 p-4 h-48">
                <div class="flex items-center justify-center min-w-40 min-h-40 align-middle max-w-40 max-h-40">
                  <img src={server.image || defaultServer} alt={server.name} class="rounded-md w-40 h-40" />
                </div>
                <div class="flex flex-col w-full">
                  <h2 class="text-xl font-bold">
                    {(server.status && server.status.hostname) || server.name || t("servers.no_name", "No name")}
                  </h2>
                  <p class="text-base-content/50">
                    {server.description || t("servers.no_description", "No description")}
                  </p>
                  <div class="flex gap-4">
                    <div class="grid grid-cols-3 gap-4 w-full">
                      <p class="text-base-content/50">
                        {t("servers.vote", "Vote")}: <span class="font-bold">{server.vote}</span>
                      </p>
                      <p class="text-base-content/50">
                        {t("servers.players", "Players")}:{" "}
                        <span class="font-bold">
                          {(server.status && server.status.players + "/" + server.status.maxPlayers) ||
                            t("servers.offline", "Offline")}
                        </span>
                      </p>
                      <p class="text-base-content/50">
                        {t("servers.ip", "IP")}:{" "}
                        <a
                          href={"steam://connect/" + server.ip + ":" + server.port}
                          class="font-bold text-secondary hover:text-secondary-content"
                        >
                          {server.ip + ":" + server.port}
                        </a>
                      </p>
                      <p class="text-base-content/50">
                        {t("servers.game_mode", "Game Mode")}:{" "}
                        <span class="font-bold">{(server.status && server.status.gameMode) || "Offline"}</span>
                      </p>
                      <p class="text-base-content/50">
                        {t("servers.map", "Map")}:{" "}
                        <span class="font-bold">{(server.status && server.status.map) || "Offline"}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </>
  );
};

export default Servers;
