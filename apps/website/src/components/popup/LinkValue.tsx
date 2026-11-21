import type { Component, ParentProps } from 'solid-js'
import { A } from '@solidjs/router'

interface LinkValue extends ParentProps {
  text?: string
  url: string
  class?: string
}

export const LinkValue: Component<LinkValue> = (props) => {
  const text = () => props.text || props.url.replace(/https?:\/\//, '').replace(/\/$/, '')
  return (
    <A
      href={props.url}
      target="_blank"
      rel="noopener noreferrer"
      class={`w-min text-nowrap rounded-md px-1 link link-hover ${props.class ?? ''}`}
      style={{
        'background-color': `hsla(0, 0%, 52%, 0.1)`,
      }}
    >
      {text()}
    </A>
  )
}
