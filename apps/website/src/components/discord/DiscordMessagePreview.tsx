import type { Component } from 'solid-js'
import { DiscordText } from './DiscordStatusPreview.js'

/** Plain-text Discord formatting only; this preview cannot execute HTML or send a message. */
const DiscordMessagePreview: Component<{ author: string; content: string; label: string }> = (props) => (
  <div role="region" aria-label={props.label} class="flex min-w-0 gap-3 rounded-xl bg-[#313338] p-4 text-[#dbdee1]">
    <div class="min-w-0 flex-1">
      <p class="mb-2 font-semibold text-[#f2f3f5] [overflow-wrap:anywhere]">{props.author}</p>
      <div class="whitespace-pre-wrap [overflow-wrap:anywhere]">
        <DiscordText text={props.content} />
      </div>
    </div>
  </div>
)
export default DiscordMessagePreview
