import { For, Match, Switch, type Component } from 'solid-js'

/** Small, safe subset of Discord formatting; message text is never interpreted as HTML. */
const DiscordText: Component<{ text: string }> = (props) => {
  const tokens = () => props.text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`|__[^_\n]+__|~~[^~\n]+~~)/g)
  return (
    <For each={tokens()}>
      {(token) => (
        <Switch fallback={token}>
          <Match when={token.startsWith('**') && token.endsWith('**')}>
            <strong>{token.slice(2, -2)}</strong>
          </Match>
          <Match when={token.startsWith('`') && token.endsWith('`')}>
            <code class="rounded px-1 bg-black/20 font-mono">{token.slice(1, -1)}</code>
          </Match>
          <Match when={token.startsWith('__') && token.endsWith('__')}>
            <u>{token.slice(2, -2)}</u>
          </Match>
          <Match when={token.startsWith('~~') && token.endsWith('~~')}>
            <s>{token.slice(2, -2)}</s>
          </Match>
        </Switch>
      )}
    </For>
  )
}

export default DiscordText
