import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import ConsentBanner from './ConsentBanner'

beforeEach(() => localStorage.clear())

it('nao presume consentimento de analytics', async () => {
  const listener = vi.fn()
  window.addEventListener('betintel:consent', listener)
  render(<ConsentBanner />)
  expect(localStorage.getItem('betintel.consent.v1')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Somente essenciais' }))
  expect(localStorage.getItem('betintel.consent.v1')).toBe('essential')
  expect(listener).toHaveBeenCalledOnce()
  window.removeEventListener('betintel:consent', listener)
})
