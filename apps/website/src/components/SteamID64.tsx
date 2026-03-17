import { Component, ParentProps } from "solid-js";

interface SteamID64Props extends ParentProps {
  steamID64: string;
}

export const SteamID64: Component<SteamID64Props> = (props) => {
  const steamID64 = props.steamID64;

  return (
    <a
      href={`https://steamcommunity.com/profiles/${steamID64}`}
      target="_blank"
      rel="noopener noreferrer"
      class="text-info-500 hover:underline"
    >
      {steamID64}
    </a>
  );
};
