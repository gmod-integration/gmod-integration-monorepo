import { Component, createResource, Show } from "solid-js";
import AdminPanel from "../../../../../components/AdminPanel";
import { guildChannelsRefetch } from "../../GuildInformations";
import AdminChannelSelector from "../../../../../components/AdminChannelSelector";
import { useI18n } from "../../../../../i18n";
import DiscordChannel from "../../../../../components/discord/DiscordChannel";
import { fetchAPI } from "../../../../../utils/api";

const fetchScreenshot = async () => {
  const res = await fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/screenshots/channel", "GET");
  if (!res.ok) {
    return {};
  }
  return await res.json();
};

export const ServerScreenshotsParameters: Component = () => {
  const [screenshots, { mutate: screenshotsMutate }] = createResource("screenshot", fetchScreenshot);
  const { t } = useI18n();

  const sendScreenshots = async (channelID: string) => {
    const res = await fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/screenshots/channel", "POST", {
      channelID,
    });
    if (!res.ok) {
      return;
    }
    const screenshot = await res.json();
    screenshotsMutate(screenshot);
    return screenshot;
  };

  const removeScreenshots = async () => {
    const res = await fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/screenshots/channel", "DELETE");
    if (!res.ok) {
      return;
    }
    screenshotsMutate({});
    return {};
  };

  return (
    <>
      <AdminChannelSelector id="select_channel_modal" callback={sendScreenshots} />

      <AdminPanel
        title={t("dashboard.server.screenshots.title", "Server Screenshots")}
        description={t(
          "dashboard.server.screenshots.description",
          "Configure where screenshots from your server will be sent",
        )}
      >
        <div class="flex w-fit items-center">
          <span class="mr-2">{t("dashboard.server.screenshots.current_channel", "Current Channel")}:</span>
          <Show
            when={!screenshots.loading && screenshots().channelID}
            fallback={
              <span>{t("dashboard.server.screenshots.no_channel", "No channel selected")}</span>
            }
          >
            <DiscordChannel channelID={screenshots().channelID} />
          </Show>
        </div>
        <div class="flex gap-4">
          <Show when={!screenshots.loading && screenshots().channelID}>
            <button
              class="btn btn-warning"
              disabled={screenshots.loading}
              onClick={async () => {
                await removeScreenshots();
              }}
            >
              {t("dashboard.server.screenshots.delete_channel", "Delete Channel")}
            </button>
          </Show>
          <button
            class="btn btn-base-200"
            disabled={screenshots.loading}
            onClick={() => {
              // @ts-ignore
              select_channel_modal.showModal();
              guildChannelsRefetch();
            }}
          >
            {t("dashboard.server.screenshots.select_channel", "Select Channel")}
          </button>
        </div>
      </AdminPanel>
    </>
  );
};
