import { Component, createResource, Show } from "solid-js";
import AdminPanel from "../../../../../components/AdminPanel";
import DiscordChannel from "../../../../../components/discord/DiscordChannel";
import { guildChannelsRefetch } from "../../GuildInformations";
import { useI18n } from "../../../../../i18n";
import { fetchAPI } from "../../../../../utils/api";
import AdminChannelSelector from "../../../../../components/AdminChannelSelector";

const fetchLogHideIP = async () => {
  const res = await fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/settings/log_hide_ip", "GET");
  if (!res.ok) {
    return {};
  }
  return await res.json();
};

const fetchLogFile = async () => {
  const res = await fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/settings/log_include_file", "GET");
  if (!res.ok) {
    return {};
  }
  return await res.json();
};

const fetchLogsChannel = async () => {
  const res = await fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/logs/channels", "GET");
  if (!res.ok) {
    return {};
  }
  return await res.json();
};

export const ServerLogsParameters: Component = () => {
  const { t } = useI18n();
  const [logsChannel, { mutate: logsChannelMutate }] = createResource("logsChannel", fetchLogsChannel);
  const [logHideIP, { mutate: logHideIPMutate }] = createResource("logHideIP", fetchLogHideIP);
  const [logFile, { mutate: logFileMutate }] = createResource("logFile", fetchLogFile);

  const sendLogChannel = async (channelID: string) => {
    const res = await fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/logs/channels", "POST", {
      channelID,
    });
    if (!res.ok) {
      return;
    }
    const screenshot = await res.json();
    logsChannelMutate(screenshot);
  };

  const removeLogChannel = async () => {
    const res = await fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/logs/channels", "DELETE");
    if (!res.ok) {
      return;
    }
    logsChannelMutate({});
    return {};
  };

  async function editLogHideIP(value: boolean) {
    fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/settings/log_hide_ip", "PUT", {
      value: value,
    })
      .then((res) => {
        if (res.ok) {
          return res.json();
        } else {
          throw new Error("An error occurred while updating the pseudo direction.");
        }
      })
      .then((data) => {
        logHideIPMutate(data);
      });
  }

  async function editLogFile(value: boolean) {
    fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/settings/log_include_file", "PUT", {
      value: value,
    })
      .then((res) => {
        if (res.ok) {
          return res.json();
        } else {
          throw new Error("An error occurred while updating the pseudo direction.");
        }
      })
      .then((data) => {
        logFileMutate(data);
      });
  }

  return (
    <>
      <AdminChannelSelector id="select_channel_modal" callback={sendLogChannel} />

      <AdminPanel
        title={t("dashboard.server.logs.title.logs_channel", "Logs Channel")}
        description={t(
          "dashboard.server.logs.description.logs_channel",
          "Set a channel to sync the logs between your server and Discord.",
        )}
      >
        <div class="flex w-fit items-center">
          <span class="mr-2">{t("dashboard.server.logs.label.chats_channels", "Chats Channels:")}</span>
          <Show
            when={!logsChannel.loading && logsChannel().channelID}
            fallback={<span>{t("dashboard.server.logs.no_logs_channel", "No Logs Channel")}</span>}
          >
            <DiscordChannel channelID={logsChannel().channelID} />
          </Show>
        </div>
        <Show when={!logHideIP.loading}>
          <div class="flex w-fit items-center">
            <span class="mr-2">{t("dashboard.server.logs.label.hide_ip", "Hide IP in discord logs:")}</span>
            <input
              type="checkbox"
              class="toggle toggle-md"
              disabled={logHideIP.loading}
              checked={logHideIP() ? logHideIP().value : false}
              onChange={async (e) => {
                await editLogHideIP(e.currentTarget.checked);
              }}
            />
          </div>
        </Show>
        <Show when={!logFile.loading}>
          <div class="flex w-fit items-center">
            <span class="mr-2">
              {t("dashboard.server.logs.label.attach_log_file", "Attach log information file:")}
            </span>
            <input
              type="checkbox"
              class="toggle toggle-md"
              disabled={logFile.loading}
              checked={logFile() ? logFile().value : false}
              onChange={async (e) => {
                await editLogFile(e.currentTarget.checked);
              }}
            />
          </div>
        </Show>
        <div class="flex gap-4">
          <Show when={!logsChannel.loading && logsChannel().channelID}>
            <button
              disabled={logsChannel.loading}
              class="btn btn-warning"
              onClick={async () => {
                await removeLogChannel();
              }}
            >
              {t("dashboard.server.logs.button.remove_channel", "Remove Channel")}
            </button>
          </Show>
          <button
            disabled={logsChannel.loading}
            class="btn btn-base-200"
            onClick={() => {
              // @ts-ignore
              select_channel_modal.showModal();
              guildChannelsRefetch();
            }}
          >
            {t("dashboard.server.logs.button.select_channel", "Select Channel")}
          </button>
        </div>
      </AdminPanel>
    </>
  );
};
