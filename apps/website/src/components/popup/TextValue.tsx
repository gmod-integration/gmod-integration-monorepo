import { Component, ParentProps } from 'solid-js'

interface TextValue extends ParentProps {
  value: string
  class?: string
}

export const TextValue: Component<TextValue> = (props) => {
  return (
    <p
      class="w-min text-nowrap rounded-md px-1"
      style={{
        'background-color': `hsla(0, 0%, 52%, 0.1)`,
      }}
    >
      {props.value || ''}
    </p>
  )
}
