import { Show, splitProps, type JSX } from 'solid-js'

export interface ButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning'
  size?: 'sm' | 'md'
  loading?: boolean
}

const variants = {
  primary: 'btn-primary',
  secondary: 'btn-base-200',
  ghost: 'btn-ghost',
  danger: 'btn-error',
  warning: 'btn-warning',
}

/** Native button semantics with shared sizes and pending behavior. */
export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, [
    'variant',
    'size',
    'loading',
    'class',
    'children',
    'type',
    'disabled',
    'onClick',
  ])
  const handleClick: JSX.EventHandler<HTMLButtonElement, MouseEvent> = (event) => {
    if (local.disabled || local.loading) {
      event.preventDefault()
      return
    }
    const handler = local.onClick
    if (typeof handler === 'function') handler(event)
    else if (handler) handler[0](handler[1], event)
  }
  return (
    <button
      type={local.type ?? 'button'}
      class={`ui-button btn ${variants[local.variant ?? 'secondary']} ${local.size === 'sm' ? 'btn-sm' : 'btn-md'} ${local.class ?? ''}`}
      data-variant={local.variant ?? 'secondary'}
      data-size={local.size ?? 'md'}
      {...rest}
      disabled={local.disabled || local.loading}
      aria-busy={local.loading || undefined}
      onClick={handleClick}
    >
      <Show when={local.loading}>
        <span class="loading loading-spinner loading-sm" aria-hidden="true"></span>
      </Show>
      {local.children}
    </button>
  )
}

export interface ButtonLinkProps extends JSX.AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
}

/** Navigation keeps native link semantics and shares the same visual variants as actions. */
export function ButtonLink(props: ButtonLinkProps) {
  const [local, rest] = splitProps(props, ['variant', 'size', 'class', 'children'])
  return (
    <a
      class={`ui-button btn ${variants[local.variant ?? 'secondary']} ${local.size === 'sm' ? 'btn-sm' : 'btn-md'} ${local.class ?? ''}`}
      data-variant={local.variant ?? 'secondary'}
      data-size={local.size ?? 'md'}
      {...rest}
    >
      {local.children}
    </a>
  )
}
