import { Component, createSignal, Match, Show, Switch } from "solid-js";
import { useI18n } from "../../../../../i18n";
import JsonViewer from "../../../../../components/JsonViewer";
import { ColorsLogsType } from "./ColorLogsType";

const typeFormat: Record<string, { class: string }> = {
  playerName: {
    class: "text-yellow-400",
  },
  stringPrimary: {
    class: "text-teal-200",
  },
};

interface GetFormatProps {
  type: string;
  text: string;
}

const GetFormat: Component<GetFormatProps> = (props) => {
  return (
    <>
      <span class={typeFormat[props.type]?.class}>{props.text}</span>
    </>
  );
};

interface GetFormatPlayerProps {
  ply: any;
}

const PlayerComponent: Component<GetFormatPlayerProps> = (props) => {
  const { t } = useI18n();
  return (
    <>
      <GetFormat type="playerName" text={props.ply ? props.ply.name : t("dashboard.server.logs.unknown", "Unknown")} />
    </>
  );
};

interface AddDataProps {
  data: any;
  category: string;
  createAt: Date;
}

const [selectLog, setSelectLog] = createSignal(0);
let idxLog = 0;
export const AddLogComponent: Component<AddDataProps> = (props) => {
  const logContentStr = JSON.stringify(props.data, null, 2).split("\n");
  const { t } = useI18n();
  idxLog++;
  const localIdxLog = idxLog;
  return (
    <>
      <tr>
        <td class="text-base-content/70">{props.createAt.toLocaleString()}</td>
        <ColorsLogsType category={props.category} />
        <td>
          <Switch fallback={<span>{JSON.stringify(props.data)}</span>}>
            <Match when={props.category === "player_say"}>
              <span>
                <PlayerComponent ply={props.data.ply} /> {t("dashboard.server.logs.player_say.say", "say")}{" "}
                <GetFormat type="stringPrimary" text={props.data.text} />
              </span>
            </Match>
            <Match when={props.category === "player_disconnect"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.player_disconnect.has_disconnected", "has disconnected")}
              </span>
            </Match>
            <Match when={props.category === "player_spawn"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.player_spawn.has_spawned", "has spawned")}
              </span>
            </Match>
            <Match when={props.category === "player_death"}>
              <span>
                <PlayerComponent ply={props.data.plyTarget} />{" "}
                {t("dashboard.server.logs.player_death.has_been_killed_by", "has been killed by")}{" "}
                <PlayerComponent ply={props.data.plyAttacker} />
              </span>
            </Match>
            <Match when={props.category === "player_ready"}>
              <span>
                <PlayerComponent ply={props.data.ply} /> {t("dashboard.server.logs.player_ready.is_ready", "is ready")}
              </span>
            </Match>
            <Match when={props.category === "player_connect"}>
              <span>
                <GetFormat type="playerName" text={props.data.name} />{" "}
                {t("dashboard.server.logs.player_connect.is_connecting_from", "is connecting from")}{" "}
                <GetFormat type="stringPrimary" text={props.data.ip} />
              </span>
            </Match>
            <Match when={props.category === "player_change_team"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.player_change_team.has_changed_team_from", "has changed team from")}{" "}
                <GetFormat type="stringPrimary" text={props.data.oldTeam} />{" "}
                {t("dashboard.server.logs.player_change_team.to", "to")}{" "}
                <GetFormat type="stringPrimary" text={props.data.newTeam} />
              </span>
            </Match>
            <Match when={props.category === "player_change_group"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.player_change_group.has_changed_group_from", "has changed group from")}{" "}
                <GetFormat type="stringPrimary" text={props.data.oldGroup} />{" "}
                {t("dashboard.server.logs.player_change_group.to", "to")}{" "}
                <GetFormat type="stringPrimary" text={props.data.newGroup} />
              </span>
            </Match>
            <Match when={props.category === "player_change_name"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.player_change_name.has_changed_name_from", "has changed name from")}{" "}
                <GetFormat type="stringPrimary" text={props.data.oldName} />{" "}
                {t("dashboard.server.logs.player_change_name.to", "to")}{" "}
                <GetFormat type="stringPrimary" text={props.data.newName} />
              </span>
            </Match>
            <Match when={props.category === "player_give"}>
              <span>
                <PlayerComponent ply={props.data.ply} /> {t("dashboard.server.logs.player_give.get", "get")}{" "}
                <GetFormat type="stringPrimary" text={props.data.wep_class} />
              </span>
            </Match>
            <Match when={props.category === "player_spawn_object"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.player_spawn_object.has_spawned", "has spawned")}
                <GetFormat type="stringPrimary" text={" " + props.data.object + " "} />(
                <Show
                  when={props.data.object === "prop"}
                  fallback={<GetFormat type="stringPrimary" text={props.data.entity ? props.data.entity.class : ""} />}
                >
                  <GetFormat type="stringPrimary" text={props.data.model} />
                </Show>
                )
              </span>
            </Match>
            <Match when={props.category === "player_hurt"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.player_hurt.has_been_hurt_by", "has been hurt by")}{" "}
                <PlayerComponent ply={props.data.attacker} /> {t("dashboard.server.logs.player_hurt.for", "for")}{" "}
                <GetFormat type="stringPrimary" text={props.data.damage} />{" "}
                {t("dashboard.server.logs.player_hurt.damage", "damage")}
              </span>
            </Match>
            <Match when={props.category === "player_initial_spawn"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t(
                  "dashboard.server.logs.player_initial_spawn.has_spawned_first_time",
                  "has spawned for the first time",
                )}
              </span>
            </Match>
            <Match when={props.category === "server_start" || props.category === "server_stop"}>
              <></>
            </Match>
            <Match when={props.category === "dark_rp_drop_money"}>
              <span>
                <PlayerComponent ply={props.data.ply} /> {t("dashboard.server.logs.dark_rp.has_dropped", "has dropped")}{" "}
                <GetFormat type="stringPrimary" text={props.data.amount} />
              </span>
            </Match>
            <Match when={props.category === "dark_rp_picked_up_money"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.dark_rp.has_picked_up", "has picked up")}{" "}
                <GetFormat type="stringPrimary" text={props.data.amount} />
              </span>
            </Match>
            <Match when={props.category === "dark_rp_picked_up_cheque"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.dark_rp.has_picked_up_cheque", "has picked up cheque")}{" "}
                <GetFormat type="stringPrimary" text={props.data.amount} />
              </span>
            </Match>
            <Match when={props.category === "ch_atm_send_money"}>
              <span>
                <PlayerComponent ply={props.data.ply} /> {t("dashboard.server.logs.ch_atm.has_sent", "has sent")}{" "}
                <GetFormat type="stringPrimary" text={props.data.amount} />
              </span>
            </Match>
            <Match when={props.category === "ch_atm_receive_money"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.ch_atm.has_received", "has received")}{" "}
                <GetFormat type="stringPrimary" text={props.data.amount} />
              </span>
            </Match>
            <Match when={props.category === "ch_atm_take_money"}>
              <span>
                <PlayerComponent ply={props.data.ply} /> {t("dashboard.server.logs.ch_atm.has_taken", "has taken")}{" "}
                <GetFormat type="stringPrimary" text={props.data.amount} />
              </span>
            </Match>
            <Match when={props.category === "ch_atm_withdraw_money"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.ch_atm.has_withdrawn", "has withdrawn")}{" "}
                <GetFormat type="stringPrimary" text={props.data.amount} />
              </span>
            </Match>
            <Match when={props.category === "ch_atm_deposit_money"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.ch_atm.has_deposited", "has deposited")}{" "}
                <GetFormat type="stringPrimary" text={props.data.amount} />
              </span>
            </Match>
            <Match when={props.category === "player_warned"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.player_warned.has_been_warned", "has been warned")}{" "}
                <GetFormat type="stringPrimary" text={props.data.reason} />
              </span>
            </Match>
            <Match when={props.category === "player_ban"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.player_ban.has_been_banned", "has been banned")}{" "}
                <GetFormat type="stringPrimary" text={props.data.reason} />
              </span>
            </Match>
            <Match when={props.category === "player_unban"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.player_unban.has_been_unbanned", "has been unbanned")}{" "}
                <GetFormat type="stringPrimary" text={props.data.reason} />
              </span>
            </Match>
            <Match when={props.category === "player_kick"}>
              <span>
                <PlayerComponent ply={props.data.ply} />{" "}
                {t("dashboard.server.logs.player_kick.has_been_kicked", "has been kicked")}{" "}
                <GetFormat type="stringPrimary" text={props.data.reason} />
              </span>
            </Match>
          </Switch>
        </td>
        <td>
          <div class="flex gap-2 justify-center">
            <div
              class="tooltip tooltip-info"
              data-tip={t("dashboard.server.logs.tooltip.show_more", "Show More")}
              onClick={() => {
                if (selectLog() === localIdxLog) {
                  setSelectLog(0);
                } else {
                  setSelectLog(localIdxLog);
                }
              }}
            >
              <Show when={selectLog() === localIdxLog}>
                <i class="fa-solid fa-chevron-up"></i>
              </Show>
              <Show when={selectLog() !== localIdxLog}>
                <i class="fa-solid fa-chevron-down"></i>
              </Show>
            </div>
            <div class="tooltip tooltip-info" data-tip={t("dashboard.server.logs.tooltip.download", "Download")}>
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(logContentStr.join("\n"))}`}
                download={`${t("dashboard.server.logs.log_filename_prefix", "log-")}${props.createAt.toLocaleString()}.json`}
              >
                <i class="fa-solid fa-download"></i>
              </a>
            </div>
          </div>
        </td>
      </tr>

      <Show when={selectLog() === localIdxLog}>
        <tr>
          <td colspan="4" class="p-0">
            <JsonViewer data={props} />
          </td>
        </tr>
      </Show>
    </>
  );
};
