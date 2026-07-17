import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, expect, it, vi } from 'vitest'
import AuthGate from './AuthGate'

const { useAuth0Mock } = vi.hoisted(() => ({ useAuth0Mock: vi.fn() }))

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: useAuth0Mock,
}))

beforeEach(() => {
  useAuth0Mock.mockReturnValue({
    error: undefined,
    isAuthenticated: false,
    isLoading: false,
    loginWithRedirect: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    user: undefined,
  })
})

it('orienta a configuração local sem liberar autenticação fictícia', async () => {
  const { container } = render(<AuthGate configurationMissing><div>Aplicação privada</div></AuthGate>)

  expect(screen.getByRole('heading', { name: 'Conecte o acesso seguro' })).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('Configuração do Auth0 pendente')
  expect(screen.getByRole('link', { name: 'Visualizar demonstração' })).toHaveAttribute('href', '/?demo=1')
  expect(screen.queryByText('Aplicação privada')).not.toBeInTheDocument()

  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
  expect(result.violations).toEqual([])
})

it('mantém login e criação de conta bloqueados até a declaração explícita', async () => {
  const loginWithRedirect = vi.fn().mockResolvedValue(undefined)
  useAuth0Mock.mockReturnValue({
    error: undefined,
    isAuthenticated: false,
    isLoading: false,
    loginWithRedirect,
    logout: vi.fn().mockResolvedValue(undefined),
    user: undefined,
  })
  render(<AuthGate configurationMissing={false}><div>Aplicação privada</div></AuthGate>)

  const enter = screen.getByRole('button', { name: 'Entrar' })
  const createAccount = screen.getByRole('button', { name: 'Criar conta' })
  expect(enter).toBeDisabled()
  expect(createAccount).toBeDisabled()

  await userEvent.click(enter)
  expect(loginWithRedirect).not.toHaveBeenCalled()

  await userEvent.click(screen.getByRole('checkbox'))
  expect(enter).toBeEnabled()
  expect(createAccount).toBeEnabled()

  await userEvent.click(enter)
  expect(loginWithRedirect).toHaveBeenCalledTimes(1)
})
