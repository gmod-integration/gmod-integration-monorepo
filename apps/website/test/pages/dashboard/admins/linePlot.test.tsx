import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@solidjs/testing-library'
import LinePlot from '../../../../src/pages/dashboard/admins/linePlot.js'

afterEach(() => cleanup())

describe('pages/dashboard/admins/linePlot.tsx', () => {
  it('renders an svg with default dimensions, a path, and one circle per data point', () => {
    const { container } = render(() => <LinePlot data={[1, 5, 3]} />)

    const svg = container.querySelector('svg')!
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('width', '640')
    expect(svg).toHaveAttribute('height', '400')

    const path = svg.querySelector('path')!
    expect(path).toHaveAttribute('fill', 'none')
    expect(path).toHaveAttribute('d')
    expect(path.getAttribute('d')).not.toBe('')

    expect(svg.querySelectorAll('circle')).toHaveLength(3)
  })

  it('honors custom width/height/margin props', () => {
    const { container } = render(() => (
      <LinePlot data={[0, 10]} width={200} height={100} marginTop={5} marginRight={5} marginBottom={5} marginLeft={5} />
    ))

    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('width', '200')
    expect(svg).toHaveAttribute('height', '100')
    expect(svg.querySelectorAll('circle')).toHaveLength(2)
  })

  it('places circles at x/y coordinates derived from the data via d3 scales', () => {
    const { container } = render(() => (
      <LinePlot data={[0, 10]} width={100} height={100} marginTop={0} marginRight={0} marginBottom={0} marginLeft={0} />
    ))
    const circles = container.querySelectorAll('circle')
    // x scale: domain [0, 1] -> range [0, 100]; y scale: domain [0, 10] (min/max) -> range [100, 0]
    expect(circles[0]).toHaveAttribute('cx', '0')
    expect(circles[0]).toHaveAttribute('cy', '100') // value 0 -> bottom
    expect(circles[1]).toHaveAttribute('cx', '100')
    expect(circles[1]).toHaveAttribute('cy', '0') // value 10 -> top
  })

  it('renders an empty (but valid) plot for a single data point', () => {
    const { container } = render(() => <LinePlot data={[7]} />)
    const svg = container.querySelector('svg')!
    expect(svg.querySelectorAll('circle')).toHaveLength(1)
  })
})
