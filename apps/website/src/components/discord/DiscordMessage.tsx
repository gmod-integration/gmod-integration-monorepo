import { Component } from "solid-js";
import { hexToHSL } from "../../utils/hexToHSL";
import { TypeDiscordChannel } from "../../utils/types/DiscordTypes";
import { guildChannels } from "../../pages/dashboard/guilds/GuildInformations";
import { getUrlWithActualParams } from "../../utils/api";

interface DiscordMessageProps {
  channelID?: string;
  channel?: TypeDiscordChannel;
  messageID: string;
}

const hsl = hexToHSL("#7d95ff");

const DiscordMessage: Component<DiscordMessageProps> = (props) => {
  let channel;

  if (!props.channelID && !props.channel) {
    return null;
  }

  if (!props.channel) {
    channel = guildChannels().find((ch: TypeDiscordChannel) => ch.id === props.channelID);
    if (!channel) return null;
  } else {
    channel = props.channel;
  }

  return (
    <a
      href={getUrlWithActualParams(`https://discord.com/channels/:guildID/${channel.id}/${props.messageID}`)}
      class="w-min text-nowrap rounded-md px-1"
      target="_blank"
      style={{
        color: "#7d95ff",
        "background-color": `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%, 0.1)`,
      }}
    >
      {`#${channel.name} > `} <i class="fa-solid fa-comment" />
    </a>
  );
};

export default DiscordMessage;
