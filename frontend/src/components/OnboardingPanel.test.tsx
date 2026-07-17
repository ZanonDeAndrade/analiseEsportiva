import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, expect, it, vi } from 'vitest'
import OnboardingPanel from './OnboardingPanel'

const me = { userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'owner' as const, sessionId: 'session-1' }
const organizations = [{ id: me.organizationId, slug: 'laboratorio', name: 'Laboratorio FC', role: 'owner' as const, active: true }]

beforeEach(() => localStorage.clear())

it('so conclui onboarding apos estados reais e confirmacao etica', async () => {
  const onComplete = vi.fn()
  const { container } = render(<OnboardingPanel me={me} organizations={organizations} emailVerified onComplete={onComplete} />)
  const button = screen.getByRole('button', { name: 'Abrir dashboard' })
  expect(button).toBeDisabled()
  await userEvent.click(screen.getByRole('checkbox'))
  expect(button).toBeEnabled()
  await userEvent.click(button)
  expect(onComplete).toHaveBeenCalledOnce()
  expect(localStorage.getItem(`betintel.onboarding.${me.userId}`)).toBe('complete')
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
  expect(result.violations).toEqual([])
})

it('nao permite continuar sem ambiente pessoal provisionado pela API', async () => {
  render(<OnboardingPanel me={me} organizations={[]} emailVerified onComplete={vi.fn()} />)
  await userEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('button', { name: 'Abrir dashboard' })).toBeDisabled()
  expect(screen.getByText('O ambiente de dados da conta ainda nao foi provisionado.')).toBeVisible()
})
