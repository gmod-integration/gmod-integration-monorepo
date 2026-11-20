import { createSignal, For, type Component } from 'solid-js'

type Notice = { id: number; message: string }
const [errorsList, setErrorsList] = createSignal<Notice[]>([])
let nextNoticeID = 0
const dismissError = (id: number) => setErrorsList((errors) => errors.filter((error) => error.id !== id))

export const Errors = (error: string, displayTime: number = 5000) => {
  const id = ++nextNoticeID
  setErrorsList((errors) => [...errors, { id, message: error }])
  setTimeout(() => dismissError(id), displayTime)
}

interface ErrorProps {
  message: string
}

export const AddErrorComponent: Component<ErrorProps> = (props) => {
  return (
    <div role="alert" class="text-error flex min-h-12 items-center rounded-lg border-error border p-4 gap-4">
      <i aria-hidden="true" class="fa-regular fa-circle-xmark"></i>
      <span>Error : {props.message}</span>
    </div>
  )
}

export const ShowErrorList: Component = () => {
  return <For each={errorsList()}>{(error) => <AddErrorComponent message={error.message} />}</For>
}
