import { Component, createMemo, ParentProps } from "solid-js";

import hljs from "highlight.js";

interface DataProps extends ParentProps {
  data: Object;
}

const JsonViewer: Component<DataProps> = (props) => {
  const highlighted = createMemo(() => hljs.highlight(JSON.stringify(props.data, null, 2), { language: "json" }).value);

  return (
    <pre class="hljs p-4">
      <code innerHTML={highlighted()}></code>
    </pre>
  );
};

export default JsonViewer;
