import { Show, type Component, type ParentProps } from 'solid-js'
import { DashboardLinkSchema } from '@gmod/schema/server/DashboardEntitiesSchema.js'
import { A } from '@solidjs/router'
import { CopyableValue } from '../ui/CopyableValue.js'

interface LinkValue extends ParentProps {
  text?: string
  url: string
  class?: string
}

export const LinkValue: Component<LinkValue> = (props) => {
  const href = () => {
    const parsed = DashboardLinkSchema.shape.url.safeParse(props.url)
    return parsed.success ? parsed.data : undefined
  }
  const text = () => props.text || props.url.replace(/https?:\/\//, '').replace(/\/$/, '')
  return (
    <CopyableValue
      value={props.url}
      class={props.class}
      display={
        <Show when={href()} fallback={<span>{text()}</span>}>
          {(url) => (
            <A href={url()} target="_blank" rel="noopener noreferrer" class="link link-hover">
              {text()}
            </A>
          )}
        </Show>
      }
    />
  )
}
