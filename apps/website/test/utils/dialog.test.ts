import { afterEach, describe, expect, it } from 'vitest'
import { closeDialog, showDialog } from '../../src/utils/dialog.js'

afterEach(() => document.body.replaceChildren())

describe('dialog controls', () => {
  it('opens a dialog, leaves an open dialog open and closes it', () => {
    const dialog = document.createElement('dialog')
    dialog.id = 'settings'
    document.body.append(dialog)

    showDialog('settings')
    expect(dialog.open).toBe(true)
    showDialog('settings')
    expect(dialog.open).toBe(true)
    closeDialog('settings')
    expect(dialog.open).toBe(false)
  })

  it('ignores missing targets and non-dialog elements', () => {
    const element = document.createElement('div')
    element.id = 'other'
    document.body.append(element)
    expect(() => {
      showDialog('missing')
      closeDialog('missing')
      showDialog('other')
      closeDialog('other')
    }).not.toThrow()
  })
})
