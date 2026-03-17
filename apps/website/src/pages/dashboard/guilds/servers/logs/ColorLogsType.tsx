import { Component } from "solid-js";
import { useI18n } from "../../../../../i18n";

const logColors: Record<string, string> = {
  player_connect: "#cd8f51",
  player_disconnect: "#cd8f51",
  player_death: "#cd5151",
  player_spawn: "#51cd51",
  player_ready: "#51cd51",
  player_change_team: "#cd51bc",
  player_change_group: "#cd51bc",
  player_change_name: "#cd51bc",
  player_give: "#cdc751",
  player_spawn_object: "#68c13c",
  player_hurt: "#cd5151",
  player_initial_spawn: "#51cd51",
  player_say: "#51c3cd",
  default: "#2B2D31",
  server_start: "#7c15d5",
  server_stop: "#7c15d5",
  dark_rp_drop_money: "#c7c751",
  dark_rp_picked_up_money: "#c7c751",
  dark_rp_picked_up_cheque: "#c7c751",
  ch_atm_send_money: "#adc751",
  ch_atm_receive_money: "#adc751",
  ch_atm_take_money: "#adc751",
  ch_atm_withdraw_money: "#adc751",
  ch_atm_deposit_money: "#adc751",
  player_warned: "#9d2929",
  player_ban: "#9d2929",
  player_unban: "#9d2929",
  player_kick: "#9d2929",
};

const logNames: Record<string, string> = {
  player_connect: "Player Connect",
  player_disconnect: "Player Disconnect",
  player_death: "Player Death",
  player_spawn: "Player Spawn",
  player_ready: "Player Ready",
  player_change_team: "Player Change Team",
  player_change_group: "Player Change Group",
  player_change_name: "Player Change Name",
  player_say: "Player Say",
  player_give: "Player Give",
  player_spawn_object: "Player Spawn Object",
  player_hurt: "Player Hurt",
  player_initial_spawn: "Player Initial Spawn",
  server_start: "Server Start",
  server_stop: "Server Stop",
  dark_rp_drop_money: "DarkRP Drop Money",
  dark_rp_picked_up_money: "DarkRP Picked Up Money",
  dark_rp_picked_up_cheque: "DarkRP Picked Up Cheque",
  ch_atm_send_money: "ATM Send Money",
  ch_atm_receive_money: "ATM Receive Money",
  ch_atm_take_money: "ATM Take Money",
  ch_atm_withdraw_money: "ATM Withdraw Money",
  ch_atm_deposit_money: "ATM Deposit Money",
  player_warned: "Player Warned",
  player_ban: "Player Ban",
  player_unban: "Player Unban",
  player_kick: "Player Kick",
};

interface AddDataProps {
  category: string;
  className?: string;
}

export const ColorsLogsType: Component<AddDataProps> = (props) => {
  const { t } = useI18n();

  return (
    <td class={`text-base-content/70 ${props.className || ""}`} style={`color: ${logColors[props.category] || "#fff"}`}>
      {t(`dashboard.server.logs.logNames.${props.category}`, logNames[props.category] || props.category)}
    </td>
  );
};
