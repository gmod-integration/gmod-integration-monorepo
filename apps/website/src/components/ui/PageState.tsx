import { createUniqueId, Show, type JSX } from 'solid-js'
import { Icon, type IconName } from './Icon.js'

/** Shared full-page empty, redirect and authentication presentation. */
export function PageState(props: {
  icon: IconName
  title: string
  description?: string
  status?: boolean
  children?: JSX.Element
}) {
  const id = createUniqueId()
  return (
    <section class="public-state-page" aria-labelledby={id}>
      <div class="public-state-card" role={props.status ? 'status' : undefined}>
        <span class="public-state-icon">
          <Icon name={props.icon} size={26} />
        </span>
        <h1 id={id}>{props.title}</h1>
        <Show when={props.description}>
          <p>{props.description}</p>
        </Show>
        <Show when={props.children}>
          <div class="public-state-actions">{props.children}</div>
        </Show>
      </div>
    </section>
  )
}
