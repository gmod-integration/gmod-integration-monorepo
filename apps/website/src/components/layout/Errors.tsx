import { Component, createSignal, For, ParentProps } from "solid-js";

const [errorsList, setErrorsList] = createSignal<string[]>([]);
export const Errors = (error: string, displayTime: number = 5000) => {
  setErrorsList((errors: string[]) => [...errors, error]);
  setTimeout(() => {
    setErrorsList((errors: string[]) => errors.filter((e: string) => e !== error));
  }, displayTime);
};

interface ErrorProps extends ParentProps {
  message: string;
}

export const AddErrorComponent: Component<ErrorProps> = (props) => {
  return (
    <>
      <div class="text-error flex h-12 items-center rounded-lg border-error border p-4 gap-4">
        <i class="fa-regular fa-circle-xmark"></i>
        <span>Error : {props.message}</span>
      </div>
    </>
  );
};

export const ShowErrorList: Component = (props: ParentProps) => {
  return (
    <>
      <For each={errorsList()}>{(error) => <AddErrorComponent message={error} />}</For>
    </>
  );
};
