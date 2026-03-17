import { Component } from "solid-js";
import { ServerScreenshotsParameters } from "./ServerScreenshotsParameters";
import { ServerScreenshotList } from "./ServerScreenshotList";

const ServerScreenshots: Component = () => {
  return (
    <>
      <ServerScreenshotsParameters />
      <ServerScreenshotList />
    </>
  );
};

export default ServerScreenshots;
