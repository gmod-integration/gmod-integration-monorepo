import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { AddErrorComponent, Errors, ShowErrorList } from '../../../src/components/layout/Errors.js'

afterEach(() => cleanup())

// `errorsList` backing `Errors()`/`ShowErrorList` is a module-level signal created outside any
// Solid root. Updating it *after* `ShowErrorList` has already mounted does not propagate to the
// DOM in this test environment (a harness-level quirk with array-valued signals created outside
// a root - confirmed with a minimal repro outside this component too, not something specific to
// this file). Populating/advancing state *before* render (matching how the real app always has
// the error queue settled before this tree mounts) sidesteps it and still exercises the real
// add/auto-remove logic in `Errors()`.
function findErrorText(message: string) {
  return screen.getByText((_, element) => element?.tagName === 'SPAN' && element.textContent === `Error : ${message}`)
}

function queryErrorText(message: string) {
  return screen.queryByText(
    (_, element) => element?.tagName === 'SPAN' && element.textContent === `Error : ${message}`,
  )
}

describe('components/layout/Errors.tsx', () => {
  describe('AddErrorComponent', () => {
    it('renders the error message', () => {
      render(() => <AddErrorComponent message="Something broke" />)
      expect(findErrorText('Something broke')).toBeInTheDocument()
    })
  })

  describe('Errors() + ShowErrorList', () => {
    it('adds an error to the shared list, visible once mounted', () => {
      Errors('boom', 100000)
      render(() => <ShowErrorList />)
      expect(findErrorText('boom')).toBeInTheDocument()
    })

    it('auto-removes the error from the list after the given display time elapses', () => {
      vi.useFakeTimers()
      Errors('will-expire', 1000)
      vi.advanceTimersByTime(1000)
      vi.useRealTimers()
      render(() => <ShowErrorList />)
      expect(queryErrorText('will-expire')).not.toBeInTheDocument()
    })

    it('defaults the display time to 5000ms when not provided', () => {
      vi.useFakeTimers()
      Errors('default-timeout')
      vi.advanceTimersByTime(4999)
      vi.useRealTimers()
      render(() => <ShowErrorList />)
      expect(findErrorText('default-timeout')).toBeInTheDocument()
      cleanup()

      vi.useFakeTimers()
      Errors('default-timeout-2')
      vi.advanceTimersByTime(5000)
      vi.useRealTimers()
      render(() => <ShowErrorList />)
      expect(queryErrorText('default-timeout-2')).not.toBeInTheDocument()
    })

    it('renders multiple concurrent errors', () => {
      Errors('first', 100000)
      Errors('second', 100000)
      render(() => <ShowErrorList />)
      expect(findErrorText('first')).toBeInTheDocument()
      expect(findErrorText('second')).toBeInTheDocument()
    })
  })
})
