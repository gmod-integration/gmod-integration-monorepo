import { WEBSITE_CONFIG } from "../config";
import { ClientQuery } from "./types/QueryTypes";

export const Api = "v3";
const apiBaseUrl = WEBSITE_CONFIG.apiUrl;
export const API_FQDN = apiBaseUrl + "/" + Api;

console.log("API FQDN:", API_FQDN);

export function getAPIUrl(withVersion = true) {
  if (withVersion) {
    return API_FQDN;
  }
  return apiBaseUrl;
}

export function getUrlWithActualParams(url: string) {
  url = url.replace(":discordID", localStorage.getItem("discordID") || "");
  url = url.replace(":serverID", JSON.parse(localStorage.getItem("server") || "{}").id || "");
  url = url.replace(":userID", JSON.parse(localStorage.getItem("discordUser") || "{}").id || "");
  url = url.replace(":guildID", JSON.parse(localStorage.getItem("guilds") || "{}").id || "");
  return url;
}

export function fetchAPI(endpoint: string, method: string, body?: any) {
  function setQueryParams(clQr: ClientQuery) {
    // if endpoint contains "?" then we need to add query params after "&" if not add "?" before query params
    if (endpoint.includes("?")) {
      endpoint += `&offset=${clQr.offset}&limit=${clQr.limit}&sort=${clQr.sort}&orderBy=${clQr.orderBy}`;
    } else {
      endpoint += `?offset=${clQr.offset}&limit=${clQr.limit}&sort=${clQr.sort}&orderBy=${clQr.orderBy}`;
    }
  }

  endpoint = getUrlWithActualParams(endpoint);
  return fetch(`${API_FQDN}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
    },
    body: JSON.stringify(body),
  });
}
