import { Component } from "solid-js";

const AdminChart: Component = (props: any) => {
  return (
    <div class="flex flex-col border border-base-200 rounded-lg p-4">
      <h1 class="text-lg font-semibold text-zinc-500">{props.name}</h1>
      {props.children}
    </div>
  );
};

export default AdminChart;
