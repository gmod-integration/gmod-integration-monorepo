import { createMemo, createSignal, For, mergeProps, Show } from 'solid-js'
import * as d3 from 'd3'

type PieDatum = { label: string; value: number }
type PieChartProps = { data: PieDatum[]; width?: number; height?: number; margin?: number }

export default function PieChart(provided: PieChartProps) {
  const props = mergeProps({ width: 640, height: 400, margin: 10 }, provided)
  const radius = createMemo(() => Math.max(0, Math.min(props.width, props.height) / 2 - props.margin))
  const color = d3.scaleOrdinal(d3.schemeCategory10)
  const pie = d3.pie<PieDatum>().value((d) => d.value)
  const arc = createMemo(() => d3.arc<d3.PieArcDatum<PieDatum>>().innerRadius(0).outerRadius(radius()))
  const slices = createMemo(() => pie(props.data))

  // State to control the visibility and content of the popup
  const [popup, setPopup] = createSignal({ visible: false, label: '', value: 0, x: 0, y: 0 })

  // Function to show the popup
  const showPopup = (label: string, value: number, event: MouseEvent) => {
    setPopup({
      visible: true,
      label,
      value,
      x: event.clientX + 10,
      y: event.clientY + 10,
    })
  }

  // Function to hide the popup
  const hidePopup = () => {
    setPopup({ visible: false, label: '', value: 0, x: 0, y: 0 })
  }

  return (
    <>
      <svg width={props.width} height={props.height}>
        <g transform={`translate(${props.width / 2},${props.height / 2})`}>
          <For each={slices()}>
            {(d, i) => {
              const percentage = (d.endAngle - d.startAngle) / (2 * Math.PI)

              return (
                <g>
                  <path
                    d={arc()(d) ?? undefined}
                    fill={color(String(i()))}
                    style={{ transition: 'fill 0.3s' }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.fill =
                        d3
                          .color(color(String(i())))
                          ?.darker(0.5)
                          .toString() ?? color(String(i()))
                      if (percentage < 0.05) {
                        showPopup(d.data.label, d.data.value, e)
                      }
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.fill = color(String(i()))
                      hidePopup()
                    }}
                  />
                  <text transform={`translate(${arc().centroid(d)})`} dy=".35em" text-anchor="middle" fill="white">
                    <Show when={percentage > 0.05}>
                      {d.data.label}: {d.data.value}
                    </Show>
                  </text>
                </g>
              )
            }}
          </For>
        </g>
      </svg>
      {/* Popup element */}
      <Show when={popup().visible}>
        <div
          style={{
            position: 'fixed',
            left: `${popup().x}px`,
            top: `${popup().y}px`,
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '5px',
            'border-radius': '3px',
            'pointer-events': 'none',
          }}
        >
          {popup().label}: {popup().value}
        </div>
      </Show>
    </>
  )
}
