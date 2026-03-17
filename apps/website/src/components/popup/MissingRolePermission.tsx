import { Component, createMemo, createResource, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { useI18n } from "../../i18n";
import { fetchAPI } from "../../utils/api";
import DiscordRole from "../discord/DiscordRole";

interface BotRoleSubordination {
  name: string;
  editable: boolean;
}

type BotRoleSubordinationResponse = Record<string, BotRoleSubordination>;

async function fetchBotRoleSubordination() {
  return fetchAPI("/users/:discordID/guilds/:guildID/bot/roles/subordination", "GET")
    .then((response) => response.json())
    .then((data) => {
      console.log("Bot role subordination data:", data);
      return data as BotRoleSubordinationResponse;
    })
    .catch((error) => {
      console.error("Error fetching bot role subordination:", error);
      throw error;
    });
}

export const [rolesToCheck, setRolesToCheckLocal] = createStore<string[]>([]);

export function setRolesToCheck(roles: string[]) {
  if (roles.join(",") === rolesToCheck.join(",")) return;
  setRolesToCheckLocal(roles);
}

const MissingRolePermission: Component = () => {
  const [botRoleSubordination, setBotRoleSubordination] = createResource(
    "botRoleSubordination",
    fetchBotRoleSubordination,
  );

  const { t } = useI18n();

  const uneditableRoles = createMemo(() => {
    if (botRoleSubordination.loading) return [];

    let roleToRtn: string[] = [];
    for (const roleID of rolesToCheck) {
      const role = botRoleSubordination()?.[roleID];
      if (!role) roleToRtn.push(roleID);
      if (role && !role.editable) roleToRtn.push(roleID);
    }

    return roleToRtn;
  });

  return (
    <Show when={uneditableRoles().length > 0}>
      <div class="text-warning flex items-center rounded-lg border-warning border py-2 px-4 gap-4">
        <i class="fa-solid fa-exclamation-triangle"></i>
        <span class="flex flex-wrap gap-1">
          {t(
            "tools.needRolesPerms",
            `The bot does not have the permission to assign or remove roles to users. Put the bot role higher in the role list, roles affected:`,
            "",
          )}
          <For each={uneditableRoles()}>
            {(role) => (
              <>
                <DiscordRole roleID={role} />
              </>
            )}
          </For>
        </span>
      </div>
    </Show>
  );
};

export default MissingRolePermission;
