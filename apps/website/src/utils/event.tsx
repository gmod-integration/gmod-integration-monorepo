import { createSignal } from "solid-js";

export const [isLogged, setIsLogged] = createSignal(false);

export const [discordUser, setDiscordUser] = createSignal({
  id: "",
  username: "",
  globalName: "",
  discriminator: "",
  avatarURL: "",
  displayAvatarURL: ""
});

export const [isAdmin, setIsAdmin] = createSignal(false);