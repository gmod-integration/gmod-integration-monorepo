import type { Component, ParentProps } from 'solid-js'
import { A } from '@solidjs/router'
import { CopyableValue } from '../ui/CopyableValue.js'

interface LinkValue extends ParentProps {
  text?: string
  url: string
  class?: string
}

export const LinkValue: Component<LinkValue> = (props) => {
  const text = () => props.text || props.url.replace(/https?:\/\//, '').replace(/\/$/, '')
  return (
    <CopyableValue
      value={props.url}
      class={props.class}
      display={
        <A href={props.url} target="_blank" rel="noopener noreferrer" class="link link-hover">
          {text()}
        </A>
      }
    />
  )
}
