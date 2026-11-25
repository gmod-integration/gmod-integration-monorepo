import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { Icon, type IconName } from '../../../src/components/ui/index.js'

afterEach(cleanup)

describe('shared Lucide icons', () => {
  it('renders a decorative SVG without requesting an icon font', () => {
    const { container } = render(() => <Icon name="pencil" size={20} />)
    const icon = container.querySelector('svg')!
    expect(icon).toHaveAttribute('data-icon', 'pencil')
    expect(icon).toHaveAttribute('aria-hidden', 'true')
    expect(icon).toHaveAttribute('width', '20')
    expect(icon.querySelector('path')).toBeInTheDocument()
  })

  it('updates the SVG when a control changes its icon', () => {
    const [name, setName] = createSignal<IconName>('eye')
    const { container } = render(() => <Icon name={name()} />)
    setName('eye-off')
    expect(container.querySelector('svg')).toHaveAttribute('data-icon', 'eye-off')
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })
})
