import { Component, ParentProps } from 'solid-js'
import { A } from '@solidjs/router'

interface LinkValue extends ParentProps {
  text?: string
  url: string
  class?: string
}

export const LinkValue: Component<LinkValue> = (props) => {
  if (!props.text) {
    props.text = props.url.replace(/https?:\/\//, '').replace(/\/$/, '')
  }
  return (
    <A
      href={props.url}
      target="_blank"
      class="w-min text-nowrap rounded-md px-1 link link-hover"
      style={{
        'background-color': `hsla(0, 0%, 52%, 0.1)`,
      }}
    >
      {props.text || ''}
    </A>
  )
}
