import { splitProps, type JSX } from 'solid-js'
import { Icon } from './Icon.js'

export type CheckboxProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'type'>

/** Native checkbox with a square visual and a larger pointer target. Labels stay with the field. */
export function Checkbox(props: CheckboxProps) {
  const [local, attributes] = splitProps(props, ['class'])
  return (
    <span class="ui-checkbox-control">
      <input type="checkbox" {...attributes} class={`ui-checkbox-input ${local.class ?? ''}`} />
      <span class="ui-checkbox-box" aria-hidden="true">
        <Icon name="check" size={14} strokeWidth={2.6} />
      </span>
    </span>
  )
}
