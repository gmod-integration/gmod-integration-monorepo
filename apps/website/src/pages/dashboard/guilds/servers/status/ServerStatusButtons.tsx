import { Component, createResource, createSignal, For, Match, Show, Switch } from "solid-js";
import AdminPanel from "../../../../../components/AdminPanel";
import { useI18n } from "../../../../../i18n";
import { LinkValue } from "../../../../../components/popup/LinkValue";
import { TextValue } from "../../../../../components/popup/TextValue";
import { BuyPremiumBtn } from "../../../../../utils/premium";
import { fetchAPI } from "../../../../../utils/api";
import AdminModal from "../../../../../components/AdminModal";

//show_player_list_status
class StatusButton {
  id: number;
  emoji: string;
  name: string;
  url: string;
  enable: boolean;

  constructor(id: number, emoji: string, name: string, url: string, enable: boolean) {
    this.id = id;
    this.emoji = emoji;
    this.name = name;
    this.url = url;
    this.enable = enable;
  }
}

const fetchStatusButtons = async () => {
  const res = await fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/status/buttons", "GET");
  if (!res.ok) {
    return {};
  }
  return await res.json();
};

const ServerStatusButtons: Component = () => {
  const { t } = useI18n();
  const [statusButtons, { mutate }] = createResource("statusButtons", fetchStatusButtons);
  const [selectStatusButton, setSelectStatusButton] = createSignal(new StatusButton(0, "", "", "", false));
  const [visibleEmojiPicker, setVisibleEmojiPicker] = createSignal(false);

  const createStatusButton = async () => {
    const res = await fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/status/buttons", "POST");
    if (!res.ok) {
      return;
    }
    const button = await res.json();
    mutate((prevButtons) =>
      prevButtons
        ? [...prevButtons, new StatusButton(button.id, button.emoji, button.name, button.url, button.enable)]
        : [],
    );
    return button;
  };

  const deleteStatusButton = async (button: StatusButton) => {
    const res = await fetchAPI(
      `/users/:discordID/guilds/:guildID/servers/:serverID/status/buttons/${button.id}`,
      "DELETE",
    );
    if (!res.ok) {
      return;
    }
    mutate((prevButtons) => prevButtons?.filter((b: StatusButton) => b.id !== button.id));
  };

  const editStatusButton = async (button: StatusButton) => {
    const res = await fetchAPI(
      `/users/:discordID/guilds/:guildID/servers/:serverID/status/buttons/${button.id}`,
      "PUT",
      button,
    );
    if (!res.ok) {
      return;
    }
    const newButton = await res.json();
    mutate((prevButtons) => prevButtons?.map((b: StatusButton) => (b.id === newButton.id ? newButton : b)));
    return newButton;
  };

  const handleEmojiClick = (event: CustomEvent) => {
    setSelectStatusButton({ ...selectStatusButton(), emoji: event.detail.unicode });
    setVisibleEmojiPicker(false);
  };

  return (
    <>
      <AdminModal title={t("dashboard.server.status.edit_button", "Edit Button")} id="edit_status_button">
        <div class="fieldset">
          <label class="label">
            <span>{t("dashboard.server.status.select_emoji", "Select an Emoji")}</span>
          </label>
          <button class="input text-left" onClick={() => setVisibleEmojiPicker(!visibleEmojiPicker())}>
            {selectStatusButton().emoji}
          </button>
          <Show when={visibleEmojiPicker()}>
            {/*// @ts-ignore*/}
            <emoji-picker emoji-version="12.0" onEmoji-click={handleEmojiClick}></emoji-picker>
          </Show>
        </div>

        <div class="fieldset">
          <label class="label">
            <span>{t("dashboard.server.status.button_name", "Button Name")}</span>
          </label>
          <input
            type="text"
            class="input"
            value={selectStatusButton().name}
            onChange={(e) => setSelectStatusButton({ ...selectStatusButton(), name: e.currentTarget.value })}
          />
        </div>

        <div class="fieldset">
          <label class="label">
            <span>{t("dashboard.server.status.button_url", "Button URL")}</span>
          </label>
          <input
            type="text"
            class="input"
            value={selectStatusButton().url}
            onChange={(e) => setSelectStatusButton({ ...selectStatusButton(), url: e.currentTarget.value })}
          />
        </div>

        <div class="fieldset">
          <label class="label">
            <span>{t("dashboard.server.status.button_action", "Button Action")}</span>
          </label>
          <select
            class="select"
            value={selectStatusButton().enable ? "true" : "false"}
            onChange={(e) => {
              selectStatusButton().enable = e.currentTarget.value === "true";
            }}
          >
            <option value="true">{t("dashboard.server.status.yes", "Yes")}</option>
            <option value="false">{t("dashboard.server.status.no", "No")}</option>
          </select>
        </div>

        <button
          class="btn btn-base-200 mt-2"
          onClick={async () => {
            // @ts-ignore
            edit_status_button.close();
            await editStatusButton(selectStatusButton());
          }}
        >
          {t("dashboard.server.status.save", "Save")}
        </button>
      </AdminModal>

      <AdminPanel
        title={t("dashboard.server.status.status_buttons", "Status Buttons")}
        description={t(
          "dashboard.server.status.status_buttons_description",
          "Add utility buttons to your server status message.",
        )}
        type="none"
      >
        <table class="table border-b border-base-300 rounded-none">
          <thead>
            <tr class="text-l">
              <th>{t("dashboard.server.status.button_icon", "Icon")}</th>
              <th>{t("dashboard.server.status.button_name", "Name")}</th>
              <th>{t("dashboard.server.status.button_url", "URL")}</th>
              <th class="w-1/6 text-center">{t("dashboard.server.status.active", "Active")}</th>
              <th class="w-1/6 text-center">{t("dashboard.server.status.actions", "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            <Show when={!statusButtons.loading}>
              <For each={statusButtons()}>
                {(button) => (
                  <tr>
                    <td>{button.emoji}</td>
                    <td>
                      <TextValue value={button.name} />
                    </td>
                    <td>
                      <LinkValue url={button.url} />
                    </td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        {button.enable ? (
                          <i class="fa-solid fa-check text-success"></i>
                        ) : (
                          <i class="fa-solid fa-times text-error"></i>
                        )}
                      </div>
                    </td>
                    <td>
                      <div class="flex gap-2 justify-center">
                        <div class="tooltip tooltip-info" data-tip={t("dashboard.server.status.edit", "Edit")}>
                          <i
                            class="hover:cursor-pointer fa-solid fa-edit"
                            onClick={() => {
                              // @ts-ignore
                              edit_status_button.showModal();
                              setSelectStatusButton(button);
                            }}
                          ></i>
                        </div>
                        <div class="tooltip tooltip-error" data-tip={t("dashboard.server.status.delete", "Delete")}>
                          <i
                            class="hover:cursor-pointer fa-solid fa-trash text-error"
                            onClick={() => deleteStatusButton(button)}
                          ></i>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>

        <Switch>
          <Match when={statusButtons.loading}>
            <div class="flex justify-center h-36">
              <div class="loading loading-spinner loading-lg"></div>
            </div>
          </Match>
          <Match when={statusButtons.error}>
            <tr>
              <td colSpan="4">{t("dashboard.server.status.failed_to_load", "Failed to load the links")}</td>
            </tr>
          </Match>
        </Switch>

        <div class="flex gap-4 p-4">
          <BuyPremiumBtn
            subCondition={statusButtons()?.length < 3}
            btnText={t("dashboard.server.status.premium", "Limited to 3 buttons for free users.")}
            hidden={statusButtons.loading}
          >
            <button class="btn btn-base-200" disabled={statusButtons.loading} onClick={() => createStatusButton()}>
              {t("dashboard.server.status.add_button", "Add Button")}
            </button>
          </BuyPremiumBtn>
        </div>
      </AdminPanel>
    </>
  );
};

export default ServerStatusButtons;
