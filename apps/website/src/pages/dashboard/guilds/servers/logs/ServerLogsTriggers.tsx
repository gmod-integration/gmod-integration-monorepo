import { Component, createResource, createSignal, For, Show } from "solid-js";
import AdminPanel from "../../../../../components/AdminPanel";
import { useI18n } from "../../../../../i18n";
import { ColorsLogsType } from "./ColorLogsType";
import { linkBadge } from "../../../../../components/layout/menu/DashboardMenu";
import AdminModal from "../../../../../components/AdminModal";
import { ChannelSelector } from "../../../../../components/AdminChannelSelector";
import { fetchAPI } from "../../../../../utils/api";
import { premium } from "../../../../../utils/premium";
import { TextValue } from "../../../../../components/popup/TextValue";

const log_trigger_operator: Record<string, string> = {
  greaterThan: "greaterThan",
  lessThan: "lessThan",
  equal: "equal",
  notEqual: "notEqual",
  contain: "contain",
  notContain: "notContain",
  startWith: "startWith",
  endWith: "endWith",
};

const log_trigger_action: Record<string, string> = {
  sendMessageInChannel: "sendMessageInChannel",
  // sendMessageInDMToAdmins,
};

interface log_trigger_compare {
  [key: string]: {
    type: string;
    id: string;
  };
}

const log_trigger_compare: Record<string, log_trigger_compare> = {
  dark_rp_drop_money: {
    amount: {
      type: "number",
      id: "amount",
    },
  },
  dark_rp_picked_up_money: {
    amount: {
      type: "number",
      id: "amount",
    },
  },
  dark_rp_picked_up_cheque: {
    amount: {
      type: "number",
      id: "amount",
    },
  },
  ch_atm_send_money: {
    amount: {
      type: "number",
      id: "amount",
    },
  },
  ch_atm_receive_money: {
    amount: {
      type: "number",
      id: "amount",
    },
  },
  ch_atm_take_money: {
    amount: {
      type: "number",
      id: "amount",
    },
  },
  ch_atm_withdraw_money: {
    amount: {
      type: "number",
      id: "amount",
    },
  },
  ch_atm_deposit_money: {
    amount: {
      type: "number",
      id: "amount",
    },
  },
};

interface log_trigger {
  id: number;
  log_type: string;
  value: string;
  compare: string;
  operator: string;
  action: string;
  channelID: string;
  adminIDS: string[];
  message: string;
  createdAt: Date;
  updatedAt: Date;
}

const exampleLogTriggers: log_trigger = {
  id: 0,
  log_type: "dark_rp_drop_money",
  value: "1000000",
  operator: log_trigger_operator.greaterThan,
  compare: log_trigger_compare.dark_rp_drop_money.amount.id,
  action: log_trigger_action.sendMessageInChannel,
  channelID: "",
  adminIDS: [],
  message:
    "A lot of money ({{data.amount}}) has been dropped by {{data.player.name}} ({{data.player.steamID64}}) on the ground, you should investigate.",
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const ServerLogsTriggers: Component = () => {
  const { t } = useI18n();

  async function fetchLogTriggers() {
    const res = await fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/logs/triggers", "GET");
    if (res.status === 403) {
      return [] as log_trigger[];
    } else if (!res.ok) {
      throw new Error("An error occurred while fetching the log triggers.");
    }
    return (await res.json()) as log_trigger[];
  }

  const [logTriggers, { mutate: mutateLogTrigger }] = createResource("log-triggers", fetchLogTriggers, {
    initialValue: [] as log_trigger[],
  });

  const [editedTrigger, setEditedTrigger] = createSignal<log_trigger>(exampleLogTriggers);

  async function createNewTrigger() {
    await fetchAPI("/users/:discordID/guilds/:guildID/servers/:serverID/logs/triggers", "POST", editedTrigger())
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("An error occurred while creating the trigger.");
        }
        const data = (await res.json()) as log_trigger;
        mutateLogTrigger((prev) => [...prev, data]);
      })
      .catch((err) => {
        console.error(err);
      });
  }

  async function editTrigger() {
    await fetchAPI(
      `/users/:discordID/guilds/:guildID/servers/:serverID/logs/triggers/${editedTrigger().id}`,
      "PUT",
      editedTrigger(),
    )
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("An error occurred while editing the trigger.");
        }
        const data = (await res.json()) as log_trigger;
        mutateLogTrigger((prev) => prev.map((r) => (r.id === data.id ? data : r)));
      })
      .catch((err) => {
        console.error(err);
      });
  }

  async function deleteTrigger(id: number) {
    await fetchAPI(`/users/:discordID/guilds/:guildID/servers/:serverID/logs/triggers/${id}`, "DELETE")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("An error occurred while deleting the trigger.");
        }
        const data = ((await res.json()) as log_trigger).id;
        mutateLogTrigger((prev) => prev.filter((r) => r.id !== data));
      })
      .catch((err) => {
        console.error(err);
      });
  }

  return (
    <>
      <AdminModal
        title={
          (editedTrigger().id !== 0 && t("dashboard.server.logs_trigger.edit_trigger", "Edit Trigger")) ||
          t("dashboard.server.logs_trigger.add_trigger", "Add Trigger")
        }
        id="edit_log_trigger"
      >
        <div class="fieldset">
          <label class="label">
            <span>{t("dashboard.server.logs_trigger.trigger", "Trigger")}</span>
          </label>
          <select
            class="select"
            disabled={logTriggers.loading}
            onChange={(e) => setEditedTrigger({ ...editedTrigger(), log_type: e.currentTarget.value })}
          >
            <For each={Object.keys(log_trigger_compare)}>
              {(trigger) => <option value={trigger}>{t(`dashboard.server.logs.logNames.${trigger}`, trigger)}</option>}
            </For>
          </select>
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t("dashboard.server.logs_trigger.compare", "Compare")}</span>
          </label>
          <select
            class="select"
            disabled={logTriggers.loading}
            onChange={(e) => setEditedTrigger({ ...editedTrigger(), compare: e.currentTarget.value })}
          >
            <For each={Object.keys(log_trigger_compare[editedTrigger().log_type])}>
              {(compare) => (
                <option value={compare}>
                  {t(
                    `dashboard.server.logs_trigger.compare_list.${log_trigger_compare[editedTrigger().log_type][compare].id}`,
                    log_trigger_compare[editedTrigger().log_type][compare].id,
                  )}
                </option>
              )}
            </For>
          </select>
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t("dashboard.server.logs_trigger.operator", "Operator")}</span>
          </label>
          <select
            class="select"
            disabled={logTriggers.loading}
            onChange={(e) => {
              setEditedTrigger({ ...editedTrigger(), operator: e.currentTarget.value });
            }}
          >
            <For each={Object.keys(log_trigger_operator)}>
              {(operator) => (
                <option value={operator} selected={editedTrigger().operator === operator}>
                  {t(
                    `dashboard.server.logs_trigger.operator_list.${log_trigger_operator[operator]}`,
                    log_trigger_operator[operator],
                  )}
                </option>
              )}
            </For>
          </select>
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t("dashboard.server.logs_trigger.value", "Value")}</span>
          </label>
          <input
            type="text"
            placeholder={t("dashboard.server.logs_trigger.value", "Value")}
            disabled={logTriggers.loading}
            class="input"
            value={editedTrigger().value}
            onInput={(e) => setEditedTrigger({ ...editedTrigger(), value: e.currentTarget.value })}
          />
        </div>
        <div class="fieldset">
          <label class="label">
            <span>{t("dashboard.server.logs_trigger.reply_action", "Reply Action")}</span>
          </label>{" "}
          disabled={logTriggers.loading}
          <select class="select">
            <For each={Object.keys(log_trigger_action)}>
              {(action) => (
                <option value={action} selected={editedTrigger().action === action}>
                  {t(`dashboard.server.logs_trigger.${log_trigger_action[action]}`, log_trigger_action[action])}
                </option>
              )}
            </For>
          </select>
        </div>
        <Show when={editedTrigger().action === log_trigger_action.sendMessageInChannel}>
          <div class="fieldset">
            <label class="label">
              <span>{t("dashboard.server.logs_trigger.channel", "Channel")}</span>
            </label>
            <ChannelSelector
              idSelect={editedTrigger().channelID}
              callback={(channelID) => {
                setEditedTrigger({ ...editedTrigger(), channelID });
              }}
            />
          </div>
          <div class="fieldset">
            <label class="label">
              <span>
                {t("dashboard.server.logs_trigger.message", "Message")}{" "}
                <details class="dropdown dropdown-top dropdown-right">
                  <summary class="link">({t("dashboard.server.logs_trigger.message_show_vars", "Show Vars")})</summary>
                  <div class="flex flex-col menu dropdown-content bg-base-100 rounded-box z-1 w-80 gap-2 p-2 shadow-2xl border border-base-200">
                    {/*add a description for ply var: you can use custom var with {{data.ply.steamID64}} for example */}
                    <p class="text-base-content/50">
                      {t(
                        "dashboard.server.logs_trigger.message_show_vars_description",
                        "You can use any var of the log by using {{data.path.to.var}}, here is a list of the vars you can use",
                        ["{{data.path.to.var}}"],
                      )}
                      :
                    </p>
                    <ul class="flex flex-col text-sm text-base-content/50">
                      <li>
                        {"{{data.ply.steamID64}}"} : {t("dashboard.server.logs_trigger.steamID64", "SteamID64")}
                      </li>
                      <li>
                        {"{{data.ply.name}}"} : {t("dashboard.server.logs_trigger.name", "Name")}
                      </li>
                      <li>
                        {"{{data.ply.team.name}}"} : {t("dashboard.server.logs_trigger.team", "Team")}
                      </li>
                      <li>
                        {"{{data.amount}}"} : {t("dashboard.server.logs_trigger.amount", "Amount")}
                      </li>
                      <li>
                        {"{{data.category}}"} : {t("dashboard.server.logs_trigger.category", "Category")}
                      </li>
                      <li>...</li>
                    </ul>
                  </div>
                </details>
              </span>
            </label>
            <textarea
              class="textarea"
              placeholder={t("dashboard.server.logs_trigger.message", "Message")}
              disabled={logTriggers.loading}
              value={editedTrigger().message}
              onInput={(e) => setEditedTrigger({ ...editedTrigger(), message: e.currentTarget.value })}
            />
          </div>
        </Show>
        <button
          class="btn btn-base-200 mt-2"
          disabled={!premium() || editedTrigger().channelID === "" || logTriggers.loading}
          onClick={async () => {
            // @ts-ignore
            edit_log_trigger.close();
            if (editedTrigger().id === 0) {
              await createNewTrigger();
            } else {
              await editTrigger();
            }
          }}
        >
          {(editedTrigger().id !== 0 && t("dashboard.server.logs_trigger.save", "Save")) ||
            t("dashboard.server.logs_trigger.add", "Add")}
        </button>
      </AdminModal>

      <AdminPanel
        title={t("dashboard.server.logs_trigger.title.logs_channel", "Logs Trigger")}
        description={t(
          "dashboard.server.logs_trigger.description.logs_channel",
          "Define custom actions for specific events in your server. You can customize the actions to suit your needs.",
        )}
        type="none"
        premium={true}
      >
        <table class="table border-b border-base-300 rounded-none">
          <thead>
            <tr class="text-l">
              <th class="w-1/6">{t("dashboard.server.logs_trigger.trigger", "Trigger")}</th>
              <th class="w-1/6">{t("dashboard.server.logs_trigger.compare", "Compare")}</th>
              <th class="w-1/6">{t("dashboard.server.logs_trigger.operator", "Operator")}</th>
              <th class="w-1/6">{t("dashboard.server.logs_trigger.value", "Value")}</th>
              <th class="w-1/6">{t("dashboard.server.logs_trigger.reply_action", "Reply Action")}</th>
              <th class="text-center">{t("dashboard.server.logs_trigger.action", "Action")}</th>
            </tr>
          </thead>
          <tbody>
            <Show when={!logTriggers.loading} fallback={<span class="loading loading-lg"></span>}>
              <For each={logTriggers()}>
                {(trigger) => (
                  <tr>
                    <ColorsLogsType category={trigger.log_type} />
                    <td class="w-1/6 text-nowrap">
                      {t(`dashboard.server.logs_trigger.compare_list.${trigger.compare}`, trigger.compare)}
                    </td>
                    <td class="w-1/6 text-nowrap">
                      {t(
                        `dashboard.server.logs_trigger.operator_list.${log_trigger_operator[trigger.operator]}`,
                        log_trigger_operator[trigger.operator],
                      )}
                    </td>
                    <td class="w-1/6 text-nowrap">
                      <TextValue value={trigger.value} />
                    </td>
                    <td class="w-1/6 text-nowrap">
                      {t(
                        `dashboard.server.logs_trigger.${log_trigger_action[trigger.action]}`,
                        log_trigger_action[trigger.action],
                      )}
                    </td>
                    <td class="w-1/6">
                      <div class="flex gap-2 justify-center">
                        <div class="tooltip tooltip-info" data-tip={t("dashboard.server.logs_trigger.edit", "Edit")}>
                          <i
                            class="hover:cursor-pointer fa-solid fa-edit"
                            onClick={() => {
                              setEditedTrigger(trigger);
                              // @ts-ignore
                              edit_log_trigger.showModal();
                            }}
                          />
                        </div>

                        <div class="tooltip tooltip-error" data-tip={t("dashboard.server.pseudo.delete", "Delete")}>
                          <i
                            class="hover:cursor-pointer fa-solid fa-trash text-error"
                            onClick={() => deleteTrigger(trigger.id)}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </Show>
          </tbody>
        </table>

        <div class="flex gap-4 p-4">
          <button
            class="btn btn-base-200"
            disabled={!premium()}
            onClick={() => {
              setEditedTrigger(exampleLogTriggers);
              // @ts-ignore
              edit_log_trigger.showModal();
            }}
          >
            {t("dashboard.server.logs_trigger.addTrigger", "Add Trigger")}
          </button>
        </div>
      </AdminPanel>
    </>
  );
};
