import { Show, splitProps, type JSX } from 'solid-js'
import { Button, ButtonLink, type ButtonProps, type ButtonLinkProps } from './Button.js'
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

export interface IconButtonLinkProps extends Omit<ButtonLinkProps, 'children'> {
  label: string
  icon?: IconName
  children?: JSX.Element
}

/** Icon navigation and downloads keep native link behavior and the shared action dimensions. */
export function IconButtonLink(props: IconButtonLinkProps) {
  const [local, rest] = splitProps(props, ['label', 'icon', 'children', 'title', 'class', 'size', 'variant'])
  return (
    <ButtonLink
      {...rest}
      size={local.size ?? 'sm'}
      class={`ui-icon-button ${local.class ?? ''}`}
      variant={local.variant ?? 'ghost'}
      aria-label={local.label}
      title={local.title ?? local.label}
    >
      <Show when={local.children} fallback={local.icon ? <Icon name={local.icon} /> : undefined}>
        {local.children}
      </Show>
    </ButtonLink>
  )
}
