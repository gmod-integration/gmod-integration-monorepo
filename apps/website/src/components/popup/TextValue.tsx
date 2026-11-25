import type { Component, ParentProps } from 'solid-js'
import { CopyableValue } from '../ui/CopyableValue.js'

interface TextValue extends ParentProps {
  value: string
  class?: string
}

export const TextValue: Component<TextValue> = (props) => {
  return <CopyableValue value={props.value || ''} class={props.class} />
}
