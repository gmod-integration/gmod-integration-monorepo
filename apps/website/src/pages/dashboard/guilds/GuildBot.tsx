import { Component, createResource, createSignal, onCleanup, Show } from "solid-js";
import AdminPanel from "../../../components/AdminPanel";
import { A } from "@solidjs/router";
import AdminModal from "../../../components/AdminModal";
import { useI18n } from "../../../i18n";
import { Errors } from "../../../components/layout/Errors";
import { fetchAPI, getUrlWithActualParams } from "../../../utils/api";

const GuildBot: Component = () => {
  const [showToken, setShowToken] = createSignal(false);
  const [bot, { mutate: setBot, refetch: refreshBot }] = createResource("bot", async () => {
    return await fetchAPI("/users/:discordID/guilds/:guildID/bot", "GET").then(async (res) => {
      if (!res.ok) throw new Error("An error occurred while fetching the bot.");
      return await res.json();
    });
  });
  const { t } = useI18n();

  async function saveBot() {
    const res = await fetchAPI("/users/:discordID/guilds/:guildID/bot", "PUT", bot());
    if (!res.ok) return Errors("An error occurred while saving the bot.");
    const data = await res.json();
    setBot(data);
  }

  async function setupBot() {
    const res = await fetchAPI("/users/:discordID/guilds/:guildID/bot", "PATCH", {
      token: bot().token,
    });
    if (!res.ok) return Errors("The given token is invalid or intents are missing.");
    const data = await res.json();
    setBot(data);
  }

  function getNameOf(id: string) {
    const names: Record<string, string> = {
      disabled: t("dashboard.guild.bot.disabled", "Disabled"),
      guildMemberCount: t("dashboard.guild.bot.guildMemberCount", "Show Guild Member Count"),
      playerCount: t("dashboard.guild.bot.playerCount", "Show Player Count"),
      rotate: t("dashboard.guild.bot.rotate", "Alternate Showed Information"),
    };

    return names[id] || t("dashboard.guild.bot.unknown", "Unknown");
  }

  return (
    <>
      <Show when={!bot.loading && !bot().custom}>
        <div class="text-indigo-300 flex h-12 items-center rounded-lg border-indigo-400 border p-4 gap-4">
          {/*<i class="fa-solid fa-crown"></i>*/}
          <i class="fa-solid fa-robot"></i>
          <span>
            {t(
              "dashboard.guild.bot.feature_unavailable",
              "This feature is only available for GmodStore's custom bots.",
            )}{" "}
            <A class="link" href="/gmodstore">
              {t("dashboard.guild.bot.get_custom_bot", "Get a Custom Bot")}
            </A>
          </span>
        </div>
      </Show>

      <AdminModal title={t("dashboard.guild.bot.edit_custom_bot", "Edit Custom Bot")} id="edit_bot">
        <Show when={!bot.loading}>
          {/* name */}
          <div class="fieldset">
            <label class="label">
              <span>{t("dashboard.guild.bot.name", "Name")}</span>
            </label>
            <input
              type="text"
              class="input"
              disabled={bot.loading}
              value={bot().username}
              onChange={(e) => setBot({ ...bot(), username: e.currentTarget.value })}
            />
          </div>

          {/*avatar*/}
          <div class="fieldset">
            <label class="label">
              <span>{t("dashboard.guild.bot.avatar", "Avatar")}</span>
            </label>
            <input
              type="text"
              class="input"
              disabled={bot.loading}
              value={bot().avatar}
              onChange={(e) => setBot({ ...bot(), avatar: e.currentTarget.value })}
            />
          </div>

          <div class="fieldset">
            <label class="label">
              <span>{t("dashboard.guild.bot.status", "Status")}</span>
              <span class="text-rose-500">{t("dashboard.guild.bot.refresh_every_30s", "Refresh every 30s")}</span>
            </label>
            <select
              class="select w-full"
              disabled={bot.loading}
              onChange={(e) => setBot({ ...bot(), status: e.currentTarget.value })}
            >
              <option value="disabled" selected={bot().status == "disabled"}>
                {getNameOf("disabled")}
              </option>
              <option value="guildMemberCount" selected={bot().status == "guildMemberCount"}>
                {getNameOf("guildMemberCount")}
              </option>
              <option value="playerCount" selected={bot().status == "playerCount"}>
                {getNameOf("playerCount")}
              </option>
              <option value="rotate" selected={bot().status == "rotate"}>
                {getNameOf("rotate")}
              </option>
            </select>
          </div>

          <button
            disabled={bot.loading}
            class="btn btn-base-200 mt-2"
            onClick="edit_bot.close()"
            onClick={async () => {
              await saveBot();
            }}
          >
            {t("dashboard.guild.bot.save", "Save")}
          </button>
        </Show>
      </AdminModal>

      <AdminModal title={t("dashboard.guild.bot.setup_custom_bot", "Setup Custom Bot")} id="setup_bot">
        <Show when={!bot.loading}>
          {/*short how to (create a discord.dev bot active 3 intent copy token*/}

          {/**/}
          <div class="fieldset p-2">
            <h1 class="text-lg text-base-content/70 font-bold">
              {t("dashboard.guild.bot.how_to_setup", "How to setup a custom bot:")}
            </h1>
            <ul class="list-decimal text-base-content/60 list-inside">
              <li>
                {t("dashboard.guild.bot.create_app", "Create a app on")}{" "}
                <A class="link" href="https://discord.com/developers/applications">
                  discord.dev
                </A>
              </li>
              <li>{t("dashboard.guild.bot.go_to_bot_tab", "Go to the bot tab")}</li>
              <li>{t("dashboard.guild.bot.enable_x", "Enable 'Presence Intent'", "Presence Intent")}</li>
              <li>{t("dashboard.guild.bot.enable_x", "Enable 'Server Members Intent'", "Server Members Intent")}</li>
              <li>{t("dashboard.guild.bot.enable_x", "Enable 'Message Content Intent'", "Message Content Intent")}</li>
              <li>{t("dashboard.guild.bot.reset_token", "Reset the token")}</li>
              <li>{t("dashboard.guild.bot.copy_token", "Copy the token")}</li>
            </ul>
          </div>

          {/*set token*/}
          <div class="fieldset">
            <label class="label">
              <span>{t("dashboard.guild.bot.token", "Token")}</span>
            </label>
            <input
              type="text"
              disabled={bot.loading}
              class="input"
              value={bot().token}
              onChange={(e) => setBot({ ...bot(), token: e.currentTarget.value })}
            />
          </div>

          <button
            disabled={bot.loading}
            class="btn btn-base-200 mt-2"
            onClick="setup_bot.close()"
            onClick={async () => {
              await setupBot();
            }}
          >
            {t("dashboard.guild.bot.save", "Save")}
          </button>
        </Show>
      </AdminModal>

      <AdminPanel
        title={t("dashboard.guild.bot.custom_bot", "Custom Bot")}
        description={t("dashboard.guild.bot.edit_bot_info", "Edit the bot information.")}
      >
        {/* name */}
        <div class="flex w-fit items-center">
          <span class="mr-2 text-nowrap">{t("dashboard.guild.bot.name", "Name")} :</span>
          <span>{!bot.loading ? bot().username : t("dashboard.guild.bot.loading", "Loading...")}</span>
        </div>

        {/* avatar */}
        <div class="flex w-fit items-center">
          <span class="mr-2 text-nowrap">{t("dashboard.guild.bot.avatar", "Avatar")} :</span>
          <img src={!bot.loading ? bot().avatar : ""} alt="Avatar" class="w-8 h-8 rounded-full" />
        </div>

        <div class="flex w-fit items-center">
          <span class="mr-2 text-nowrap">{t("dashboard.guild.bot.status", "Status")} :</span>
          <span>{!bot.loading ? getNameOf(bot().status) : t("dashboard.guild.bot.loading", "Loading...")}</span>
        </div>

        <Show when={!bot.loading && bot().purchased}>
          <div class="flex w-fit items-center gap-4">
            <button
              class="btn btn-base-200"
              onClick="edit_bot.showModal()"
              classList={{
                hidden: !bot().custom || !bot().onGuild,
              }}
            >
              {t("dashboard.guild.bot.edit_custom_bot", "Edit Custom Bot")}
            </button>
            <button
              onClick={() => {
                const newWindow = window.open(
                  getUrlWithActualParams(
                    `https://discord.com/oauth2/authorize?client_id=${bot().id}&permissions=8&scope=bot&guild_id=:guildID`,
                  ),
                  "_blank",
                  "width=600,height=900",
                );
                const timer = setInterval(function () {
                  if (newWindow && newWindow.closed) {
                    clearInterval(timer);
                    refreshBot();
                  }
                }, 500);
                onCleanup(() => clearInterval(timer));
              }}
              class="btn btn-base-200"
              classList={{
                hidden: bot().onGuild || !bot().custom,
              }}
            >
              {t("dashboard.guild.bot.join_guild", "Join Guild")}
            </button>
            <button
              class="btn btn-base-200"
              onClick="setup_bot.showModal()"
              classList={{
                hidden: !bot().active,
              }}
            >
              {t("dashboard.guild.bot.setup_custom_bot", "Setup Custom Bot")}
            </button>
          </div>
        </Show>
      </AdminPanel>
    </>
  );
};

export default GuildBot;
