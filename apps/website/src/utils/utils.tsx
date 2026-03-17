export const DEV = import.meta.env.VITE_DEV === "true";
export function isDevEnvironment() {
  return DEV;
}
export const DEV_SHOW_MISSING_TRANSLATIONS = import.meta.env.VITE_DEV_SHOW_MISSING_TRANSLATIONS === "true";

export function isProduction() {
  return window.location.href.includes("//gmod-integration.com");
}

const devClientID = "1136093457782415420";
const prodClientID = "1110121451501129758";
export const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${isProduction() ? prodClientID : devClientID}&permissions=8&scope=bot`;

export function linkifyEmails(text: string) {
  const emailPattern = /(\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)/gi;
  return text.replace(emailPattern, '<a class="text-info hover:text-info-content" href="mailto:$1">$1</a>');
}

export function getGuild() {
  return JSON.parse(localStorage.getItem("guilds") || "{}");
}

export function getServer() {
  return JSON.parse(localStorage.getItem("server") || "{}");
}

export function getDiscordUser() {
  return JSON.parse(localStorage.getItem("discordUser") || "{}");
}
