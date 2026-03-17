import { isLogged } from "./event";
import { createSignal } from "solid-js";
import { getUrlWithActualParams } from "./api";
import { WEBSITE_CONFIG } from "../config";

const wsBaseUrl = WEBSITE_CONFIG.wsUrl;

export const [webSocketSignal, setWebSocketSignal] = createSignal<WebSocket | null>(null);
export const [webSocketLogsMessages, setWebSocketLogsMessages] = createSignal([] as any[]);
export const [webSocketServerStatus, setWebSocketServerStatus] = createSignal({
  isWebSocketConnected: false,
  lastRequest: new Date(new Date().getTime() - 1000 * 60 * 2),
  version: "",
  versionComparator: 1,
  serverID: "",
  action: "server_status",
} as {
  isWebSocketConnected: boolean;
  lastRequest: Date;
  version: string;
  versionComparator: number;
  serverID: string;
  action: string;
});

export function websocket(params: Array<string> = []) {
  let baseUrl = wsBaseUrl;
  baseUrl += "?action=main";
  baseUrl += "&token=" + localStorage.getItem("accessToken");
  baseUrl += "&discordID=" + localStorage.getItem("discordID");
  baseUrl += "&guildID=" + getUrlWithActualParams(":guildID");
  baseUrl += "&serverID=" + getUrlWithActualParams(":serverID");
  params.forEach((param) => {
    baseUrl += `&${param}`;
  });
  return baseUrl;
}

export function initWebSocket(forceClose = false) {
  if (!isLogged()) return;

  if (webSocketSignal() && !forceClose) {
    return;
  }

  const ws = new WebSocket(websocket());

  ws.onopen = () => {
    console.log("WebSocket connection opened");
  };

  ws.onmessage = (event) => {
    const eventData = JSON.parse(event.data);
    if (!eventData || !eventData.action) return;
    switch (eventData.action) {
      case "server_logs":
        if (eventData.serverID !== getUrlWithActualParams(":serverID")) return;
        setWebSocketLogsMessages((prev) => [eventData.data, ...prev]);
        break;
      case "server_status":
        if (eventData.serverID !== getUrlWithActualParams(":serverID")) return;
        eventData.lastRequest = new Date(eventData.lastRequest);
        setWebSocketServerStatus(eventData);
        break;
      default:
        break;
    }
  };

  ws.onclose = () => {
    console.log("WebSocket connection closed");
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  setWebSocketSignal(ws);

  // Cleanup on component unmount
  return () => {
    ws.close();
  };
}

export function sendWebSocketMessage(event: string, data: any) {
  const ws = webSocketSignal();
  if (!ws) return;
  ws.send(JSON.stringify({ action: event, data }));
}
