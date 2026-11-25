import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal, type JSX } from 'solid-js'
import { TemplateVariables } from '../../../src/components/ui/index.js'
import { I18nProvider } from '../../../src/i18n.js'

const writeText = vi.fn<(value: string) => Promise<void>>()
const renderReference = (ui: () => JSX.Element) => render(() => <I18nProvider>{ui()}</I18nProvider>)

beforeEach(() => {
  localStorage.clear()
  writeText.mockReset().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('TemplateVariables', () => {
  it('presents literal syntax, formats and examples together with the complete template', () => {
    renderReference(() => (
      <TemplateVariables
        open
        description="Use these values to build a player nickname."
        syntax="Keep the braces when copying a variable."
        variables={[{ token: '{plyName}', label: 'Player name', format: 'Text', example: 'John Doe' }]}
        formatting={[{ token: '**text**', label: 'Bold', format: 'Markdown', example: 'Strong text' }]}
        example={{ template: '[{roleName}] {plyName}', result: '[Admin] John Doe' }}
      />
    ))
    expect(screen.getByText('Available variables')).toBeInTheDocument()
    expect(screen.getByText('Use these values to build a player nickname.')).toBeInTheDocument()
    expect(screen.getByText('Keep the braces when copying a variable.')).toBeInTheDocument()
    for (const text of ['Syntax', 'Player name', '{plyName}', 'John Doe']) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0)
    }
    expect(screen.getByText('Format: Text')).toBeInTheDocument()
    expect(screen.getByText('Format: Markdown')).toBeInTheDocument()
    expect(screen.getByText('Supported formatting')).toBeInTheDocument()
    expect(screen.getByText('**text**')).toBeInTheDocument()
    expect(screen.getByText('[{roleName}] {plyName}')).toBeInTheDocument()
    expect(screen.getByText('[Admin] John Doe')).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('copies single and double braces exactly and keeps a failed copy available for retry', async () => {
    renderReference(() => (
      <TemplateVariables
        open
        variables={[
          { token: '{plyName}', label: 'Player name' },
          { token: '{{playerName}}', label: 'Event player' },
        ]}
      />
    ))
    await fireEvent.click(screen.getByRole('button', { name: 'Copy {plyName}' }))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('{plyName}'))

    writeText.mockRejectedValueOnce(new Error('Clipboard denied'))
    const doubleBraces = screen.getByRole('button', { name: 'Copy {{playerName}}' })
    await fireEvent.click(doubleBraces)
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to copy. Please try again.'))
    expect(doubleBraces).toBeEnabled()
    await fireEvent.click(doubleBraces)
    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(writeText.mock.calls.map(([value]) => value)).toEqual(['{plyName}', '{{playerName}}', '{{playerName}}'])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('updates descriptions and variable labels when the reference context changes', () => {
    const [variables, setVariables] = createSignal([{ token: '{{playerName}}', label: 'Player name' }])
    const [description, setDescription] = createSignal('For player events.')
    renderReference(() => <TemplateVariables open variables={variables()} description={description()} />)
    expect(screen.getByText('Player name')).toBeInTheDocument()
    setVariables([{ token: '{{message}}', label: 'Chat message' }])
    setDescription('For chat events.')
    expect(screen.queryByText('Player name')).not.toBeInTheDocument()
    expect(screen.queryByText('For player events.')).not.toBeInTheDocument()
    expect(screen.getByText('For chat events.')).toBeInTheDocument()
    expect(screen.getByText('Chat message')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy {{message}}' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy {{playerName}}' })).not.toBeInTheDocument()
  })

  it('treats tokens, labels and example text as plain content', () => {
    const label = '<img src=x onerror=alert(1)>'
    const token = '{{<script>alert(1)</script>}}'
    const { container } = renderReference(() => (
      <TemplateVariables open variables={[{ token, label, example: '<b>example</b>' }]} />
    ))
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText(token)).toBeInTheDocument()
    expect(screen.getByText('<b>example</b>')).toBeInTheDocument()
    expect(container.querySelector('img, script, b')).not.toBeInTheDocument()
  })

  it('renders nothing when neither variables nor formatting are available', () => {
    const { container } = renderReference(() => (
      <TemplateVariables variables={[]} formatting={[]} description="Unused guidance" />
    ))
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps formatting guidance available even when there are no variables', () => {
    renderReference(() => <TemplateVariables open variables={[]} formatting={[{ token: '**text**', label: 'Bold' }]} />)
    expect(screen.getByText('Supported formatting')).toBeInTheDocument()
    expect(screen.getByText('**text**')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy **text**' })).toBeInTheDocument()
  })
})
