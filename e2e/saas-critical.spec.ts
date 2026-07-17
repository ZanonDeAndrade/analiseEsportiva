import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockApi, orgB } from './mockApi'

async function prepare(page: import('@playwright/test').Page, completeOnboarding = false) {
  await page.addInitScript(({ complete }) => {
    localStorage.setItem('betintel.consent.v1', 'essential')
    if (complete) localStorage.setItem('betintel.onboarding.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'complete')
  }, { complete: completeOnboarding })
  return mockApi(page)
}

async function openNavigation(page: import('@playwright/test').Page, label: string) {
  const target = page.getByRole('button', { name: label })
  if ((page.viewportSize()?.width ?? 1000) <= 780) {
    const trigger = page.getByRole('button', { name: 'Abrir filtros' })
    if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click()
  }
  await target.click()
}

test('@a11y onboarding, dashboard e detalhe preservam evidencia', async ({ page }) => {
  await prepare(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Prepare sua sala de analise' })).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Abrir dashboard' }).click()
  await expect(page.locator('#matchlist').getByText('Equipe A Norte', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Ver an.lise/ }).click()
  await expect(page.getByLabel('Trilho de evidencia da predicao')).toBeVisible()
  await expect(page.getByRole('img', { name: /intervalo de 39 a 57/ })).toBeVisible()
  const results = await new AxeBuilder({ page }).exclude('[data-testid="third-party"]').analyze()
  expect(results.violations).toEqual([])
})

test('fixtures acompanham a organizacao ativa', async ({ page }) => {
  const state = await prepare(page, true)
  await page.goto('/')
  await expect(page.locator('#matchlist').getByText('Equipe A Norte', { exact: true })).toBeVisible()
  if ((page.viewportSize()?.width ?? 1000) <= 780) {
    await page.getByRole('button', { name: 'Abrir filtros' }).click()
    await page.getByLabel('Organiza\u00e7\u00e3o ativa no menu').selectOption(orgB)
  } else {
    await page.getByLabel('Organiza\u00e7\u00e3o ativa', { exact: true }).selectOption(orgB)
  }
  await expect.poll(() => state.activeOrganizationId).toBe(orgB)
  await openNavigation(page, 'Jogos e an\u00e1lises')
  await expect(page.locator('#matchlist').getByText('Equipe B Norte', { exact: true })).toBeVisible()
})

test('filtros mantem somente os cinco campeonatos suportados', async ({ page }) => {
  await prepare(page, true)
  await page.goto('/')
  if ((page.viewportSize()?.width ?? 1000) <= 780) {
    await page.getByRole('button', { name: 'Abrir filtros' }).click()
  }

  for (const league of [/Brasileir/i, /Premier League/i, /La Liga/i, /Ligue 1/i, /Bundesliga/i]) {
    await expect(page.getByRole('button', { name: league })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: /Copa|World Cup/i })).toHaveCount(0)

  await page.getByRole('button', { name: /Premier League/i }).click()
  await expect(page.getByRole('status').getByText('Nenhum jogo encontrado', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Brasileir/i }).click()
  await expect(page.locator('#matchlist').getByText('Equipe A Norte', { exact: true })).toBeVisible()
})

test('sessao expirada bloqueia cache e orienta novo login', async ({ page }) => {
  await prepare(page, true)
  await page.unroute('http://127.0.0.1:3333/**')
  await mockApi(page, { expiredSession: true })
  await page.goto('/')
  await expect(page.getByText('Sessao expirada')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entrar novamente' })).toBeVisible()
})

test('suporte cria chamado tenant-scoped sem canal ficticio', async ({ page }) => {
  await prepare(page, true)
  await page.goto('/')
  await openNavigation(page, 'Ajuda e suporte')
  await page.getByLabel('Categoria').selectOption('privacy')
  await page.getByLabel('Assunto').fill('Correcao de cadastro')
  await page.getByLabel('Descricao').fill('O nome verificado precisa de correcao pelo fluxo de privacidade.')
  await page.getByRole('button', { name: 'Enviar chamado' }).click()
  await expect(page.getByText('Correcao de cadastro')).toBeVisible()
  await expect(page.getByText(/Responsavel: privacy/i)).toBeVisible()
})
