import { Show, splitProps, type JSX } from 'solid-js'
import { Button, type ButtonProps } from './Button.js'
import { Icon, type IconName } from './Icon.js'

export interface IconButtonProps extends Omit<ButtonProps, 'children'> {
  label: string
  icon?: IconName
  children?: JSX.Element
}

/** Use for compact row actions; a translated accessible label is required. */
export function IconButton(props: IconButtonProps) {
  const [local, rest] = splitProps(props, ['label', 'icon', 'children', 'title'])
  return (
    <Button
      {...rest}
      size={props.size ?? 'sm'}
      class={`ui-icon-button ${props.class ?? ''}`}
      variant={props.variant ?? 'ghost'}
      aria-label={local.label}
      title={local.title ?? local.label}
    >
      <Show when={local.children} fallback={local.icon ? <Icon name={local.icon} /> : undefined}>
        {local.children}
      </Show>
    </Button>
  )
}
