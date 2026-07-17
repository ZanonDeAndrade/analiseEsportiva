import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { mockApi } from './mockApi'

const privateViews = [
  ['dashboard', /Jogos futuros/i],
  ['billing', /Escolha o acesso ideal/i],
  ['account', /Segurança da conta/i],
  ['support', /Ajuda e atendimento/i],
  ['admin', /Operacao interna/i],
] as const

const publicPaths = [
  '/termos-de-uso',
  '/politica-de-privacidade',
  '/cancelamento-e-reembolso',
  '/uso-aceitavel',
  '/jogo-responsavel',
  '/planos',
]

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('betintel.consent.v1', 'essential')
    localStorage.setItem('betintel.onboarding.aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'complete')
  })
  await mockApi(page, { platformAdmin: true })
})

test('todas as telas privadas preservam espacamento e viewport', async ({ page }, testInfo) => {
  for (const [view, heading] of privateViews) {
    await page.goto(`/?view=${view}`)
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
    await expectLayout(page, view)
    await attachScreenshot(page, testInfo, `private-${view}`)
  }

  await page.goto('/?view=dashboard')
  await expect(page.getByRole('heading', { name: /Jogos futuros/i })).toBeVisible()
  await page.getByRole('button', { name: 'Operação de dados' }).click()
  await expect(page.getByRole('dialog', { name: /Operação de dados/i })).toBeVisible()
  await expectLayout(page, 'data-operations')
  await attachScreenshot(page, testInfo, 'private-data-operations')
})

test('todas as telas publicas preservam espacamento e viewport', async ({ page }, testInfo) => {
  for (const path of publicPaths) {
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
    await expectLayout(page, path)
    await attachScreenshot(page, testInfo, `public-${path.slice(1)}`)
  }
})

async function expectLayout(page: Page, context: string) {
  const result = await page.evaluate(() => {
    const isVisible = (element: Element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1
    }
    const overlap = (a: DOMRect, b: DOMRect) => (
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
      && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
    )
    const siblingOverlaps = (elements: Element[]) => {
      const offenders: string[] = []
      for (let left = 0; left < elements.length; left += 1) {
        for (let right = left + 1; right < elements.length; right += 1) {
          const first = elements[left]
          const second = elements[right]
          if (!first || !second || first.parentElement !== second.parentElement) continue
          if (overlap(first.getBoundingClientRect(), second.getBoundingClientRect())) {
            offenders.push(`${first.tagName.toLowerCase()}↔${second.tagName.toLowerCase()}`)
          }
        }
      }
      return offenders
    }

    const appHeader = document.querySelector('body header')
    const headerChildren = appHeader
      ? Array.from(appHeader.children).filter(isVisible)
      : []
    const workspaceSections = Array.from(document.querySelectorAll('#workspace-main section')).filter(isVisible)
    return {
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      headerOverlaps: siblingOverlaps(headerChildren),
      sectionOverlaps: siblingOverlaps(workspaceSections),
    }
  })

  expect(result.horizontalOverflow, `${context}: overflow horizontal`).toBeLessThanOrEqual(1)
  expect(result.headerOverlaps, `${context}: itens sobrepostos no cabecalho`).toEqual([])
  expect(result.sectionOverlaps, `${context}: secoes sobrepostas`).toEqual([])
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
}
