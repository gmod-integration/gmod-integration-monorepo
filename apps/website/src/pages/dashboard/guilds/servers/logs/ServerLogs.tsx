import { Component } from "solid-js";
import { ServerLogsParameters } from "./ServerLogsParameters";
import { ServerLogsList } from "./ServerLogsList";
import { ServerLogsTriggers } from "./ServerLogsTriggers";

const ServerLogs: Component = () => {
  return (
    <>
      <ServerLogsParameters />
      <ServerLogsTriggers />
      <ServerLogsList />
    </>
  );
};

export default ServerLogs;
