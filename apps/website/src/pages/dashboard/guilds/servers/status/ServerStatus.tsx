import { Component } from 'solid-js'
import 'emoji-picker-element'
import ServerStatusButtons from './ServerStatusButtons'
// import ServerStatusCustom from "./ServerStatusCustom";
// import ServerStatusChannel from "./ServerStatusChannel";
import ServerStatusMessage from './ServerStatusMessage'

const ServerStatus: Component = () => {
  // @ts-ignore
  return (
    <>
      <ServerStatusMessage />
      <ServerStatusButtons />
      {/* <ServerStatusChannel /> */}
      {/* <ServerStatusCustom /> */}
    </>
  )
}

export default ServerStatus
