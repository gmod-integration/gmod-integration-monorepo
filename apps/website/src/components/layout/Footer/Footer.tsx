import { Component } from "solid-js";
import FirstFooter from "./FirstFooter";
import SecondFooter from "./SecondFooter";

export const Footer: Component = () => {
  return (
    <>
      <div class="flex shrink-0 flex-col">
        <hr class="border border-base-200" />
        <FirstFooter />
        <hr class="border border-base-200" />
        <SecondFooter />
      </div>
    </>
  );
};
