import { createMemo, type Component, type ParentProps } from 'solid-js'

import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'

hljs.registerLanguage('json', json)

interface DataProps extends ParentProps {
  data: object
}

const JsonViewer: Component<DataProps> = (props) => {
  const highlighted = createMemo(() => hljs.highlight(JSON.stringify(props.data, null, 2), { language: 'json' }).value)

  return (
    <pre class="hljs p-4">
      <code innerHTML={highlighted()}></code>
    </pre>
  )
}

export default JsonViewer
