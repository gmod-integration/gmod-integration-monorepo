import { Component } from "solid-js";
import { hexToHSL } from "../../utils/hexToHSL";
import { TypeDiscordRole } from "../../utils/types/DiscordTypes";
import { guildRoles } from "../../pages/dashboard/guilds/GuildInformations";

interface DiscordRoleProps {
  role?: TypeDiscordRole;
  roleID?: string;
}

const DiscordRole: Component<DiscordRoleProps> = (props) => {
  let role;

  if (!props.role && !props.roleID) {
    return null;
  }

  if (!props.role) {
    role = guildRoles().find((r: TypeDiscordRole) => r.id === props.roleID);
    if (!role) return null;
  } else {
    role = props.role;
  }

  if (role.color === 0) {
    role.colorHex = "#7d95ff";
  }

  const hsl = hexToHSL(role.colorHex);

  return (
    <>
      <p
        class="w-min h-min text-nowrap rounded-md px-1"
        style={{
          color: role.colorHex,
          "background-color": `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%, 0.1)`,
        }}
      >{`@${role.name}`}</p>
    </>
  );
};

export default DiscordRole;
