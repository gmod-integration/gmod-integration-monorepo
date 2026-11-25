import * as d3 from 'd3'
import { createMemo, For, mergeProps } from 'solid-js'

type LinePlotProps = {
  data: number[]
  width?: number
  height?: number
  marginTop?: number
  marginRight?: number
  marginBottom?: number
  marginLeft?: number
}

export default function LinePlot(provided: LinePlotProps) {
  const props = mergeProps(
    { width: 640, height: 400, marginTop: 20, marginRight: 20, marginBottom: 20, marginLeft: 20 },
    provided,
  )
  const x = createMemo(() =>
    d3.scaleLinear([0, Math.max(0, props.data.length - 1)], [props.marginLeft, props.width - props.marginRight]),
  )
  const y = createMemo(() => {
    const [minimum, maximum] = d3.extent(props.data)
    return d3.scaleLinear([minimum ?? 0, maximum ?? 1], [props.height - props.marginBottom, props.marginTop])
  })
  const path = createMemo(() =>
    d3.line<number>(
      (_value, index) => x()(index),
      (value) => y()(value),
    )(props.data),
  )
  return (
    <svg width={props.width} height={props.height}>
      <path fill="none" stroke="currentColor" stroke-width="1.5" d={path() ?? undefined} />
      <g fill="white" stroke="currentColor" stroke-width="1.5">
        <For each={props.data}>{(value, index) => <circle cx={x()(index())} cy={y()(value)} r="2.5" />}</For>
      </g>
    </svg>
  )
}

//example of use with data
