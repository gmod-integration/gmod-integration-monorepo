import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen } from '@solidjs/testing-library'
import { renderWithProviders } from '../testUtils.js'
import ToDo from '../../src/pages/ToDo.js'

afterEach(() => cleanup())

describe('pages/ToDo.tsx', () => {
  it('renders the to-do placeholder title and description', () => {
    renderWithProviders(() => <ToDo />)
    expect(screen.getByText('To-Do')).toBeInTheDocument()
    expect(screen.getByText('The page you are looking for does not exist yet.')).toBeInTheDocument()
  })
})
