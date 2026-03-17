import { createSignal, Show } from "solid-js";
import * as d3 from "d3";

export default function PieChart({ data, width = 640, height = 400, margin = 10 }) {
  const radius = Math.min(width, height) / 2 - margin;
  const color = d3.scaleOrdinal(d3.schemeCategory10);
  const pie = d3.pie().value((d) => d.value);
  const arc = d3.arc().innerRadius(0).outerRadius(radius);

  // State to control the visibility and content of the popup
  const [popup, setPopup] = createSignal({ visible: false, label: "", value: "", x: 0, y: 0 });

  // Function to show the popup
  const showPopup = (label, value, event) => {
    setPopup({
      visible: true,
      label,
      value,
      x: event.clientX + 10,
      y: event.clientY + 10,
    });
  };

  // Function to hide the popup
  const hidePopup = () => {
    setPopup({ visible: false, label: "", value: "", x: 0, y: 0 });
  };

  return (
    <>
      <svg width={width} height={height}>
        <g transform={`translate(${width / 2},${height / 2})`}>
          {pie(data).map((d, i) => {
            const percentage = (d.endAngle - d.startAngle) / (2 * Math.PI);

            return (
              <g key={i}>
                <path
                  d={arc(d)}
                  fill={color(i)}
                  style={{ transition: "fill 0.3s" }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.fill = d3.color(color(i)).darker(0.5);
                    if (percentage < 0.05) {
                      showPopup(d.data.label, d.data.value, e);
                    }
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.fill = color(i);
                    hidePopup();
                  }}
                />
                <text transform={`translate(${arc.centroid(d)})`} dy=".35em" textAnchor="middle" fill="white">
                  <Show when={percentage > 0.05}>
                    {d.data.label}: {d.data.value}
                  </Show>
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {/* Popup element */}
      <Show when={popup().visible}>
        <div
          style={{
            position: "absolute",
            left: `${popup().x}px`,
            top: `${popup().y}px`,
            background: "rgba(0, 0, 0, 0.8)",
            color: "white",
            padding: "5px",
            borderRadius: "3px",
            pointerEvents: "none",
          }}
        >
          {popup().label}: {popup().value}
        </div>
      </Show>
    </>
  );
}
