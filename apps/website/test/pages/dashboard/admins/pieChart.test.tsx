import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@solidjs/testing-library'
import * as d3 from 'd3'
import PieChart from '../../../../src/pages/dashboard/admins/pieChart.js'

afterEach(() => cleanup())

// Mirrors the color scale used inside pieChart.tsx so expected fill values can be computed
// independently of the component's internals.
const color = d3.scaleOrdinal(d3.schemeCategory10)

function bigSmallData() {
  // d3.pie() sorts by value descending by default, so "Big" always lands at index 0 and "Small"
  // at index 1 regardless of input order. Big = 970/1000 = 97% (> 5% threshold), Small = 30/1000 =
  // 3% (< 5% threshold), giving deterministic coverage of both label-visibility branches.
  return [
    { label: 'Big', value: 970 },
    { label: 'Small', value: 30 },
  ]
}

describe('pages/dashboard/admins/pieChart.tsx', () => {
  it('renders an svg with default dimensions and one path per data point', () => {
    const { container } = render(() => <PieChart data={bigSmallData()} />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('width', '640')
    expect(svg).toHaveAttribute('height', '400')
    expect(svg.querySelectorAll('path')).toHaveLength(2)
  })

  it('honors custom width/height/margin props', () => {
    const { container } = render(() => <PieChart data={bigSmallData()} width={200} height={100} margin={5} />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('width', '200')
    expect(svg).toHaveAttribute('height', '100')
    expect(svg.querySelectorAll('path')).toHaveLength(2)
  })

  it('renders no paths (and does not crash) for an empty data array', () => {
    const { container } = render(() => <PieChart data={[]} />)
    expect(container.querySelector('svg')!.querySelectorAll('path')).toHaveLength(0)
  })

  it('shows the inline label for a slice above the 5% threshold, hides it below', () => {
    const { container } = render(() => <PieChart data={bigSmallData()} />)
    const texts = Array.from(container.querySelectorAll('text'))
    expect(texts).toHaveLength(2)
    expect(texts[0].textContent).toBe('Big: 970')
    expect(texts[1].textContent).toBe('')
  })

  it('darkens the slice fill on mouseover and restores it on mouseout, without a popup for a large slice', () => {
    const { container } = render(() => <PieChart data={bigSmallData()} />)
    const bigPath = container.querySelectorAll('path')[0] as SVGPathElement
    const originalFill = bigPath.getAttribute('fill')!
    const expectedDarker = d3.color(originalFill)!.darker(0.5).toString()

    fireEvent.mouseOver(bigPath, { clientX: 50, clientY: 60 })
    expect(bigPath.style.fill).toBe(expectedDarker)
    // Big is 97% of the pie, above the 5% popup threshold, so no popup is shown on hover.
    expect(container.querySelector('div')).not.toBeInTheDocument()

    fireEvent.mouseOut(bigPath)
    expect(bigPath.style.fill).toBe(originalFill)
  })

  it('shows a positioned popup with label/value on hovering a slice below the 5% threshold, hides it on mouseout', () => {
    const { container } = render(() => <PieChart data={bigSmallData()} />)
    const smallPath = container.querySelectorAll('path')[1] as SVGPathElement

    fireEvent.mouseOver(smallPath, { clientX: 100, clientY: 200 })
    const popup = container.querySelector('div')!
    expect(popup).toBeInTheDocument()
    expect(popup.textContent).toBe('Small: 30')
    expect(popup.style.left).toBe('110px')
    expect(popup.style.top).toBe('210px')

    fireEvent.mouseOut(smallPath)
    expect(container.querySelector('div')).not.toBeInTheDocument()
  })
})
