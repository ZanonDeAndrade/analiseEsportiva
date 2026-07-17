import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('termos públicos têm rota, redirecionamento, 26 seções, impressão e download', async () => {
  const [router, page, terms] = await Promise.all([
    read('frontend/src/legal/PublicLegalRouter.tsx'),
    read('frontend/src/legal/LegalDocumentPage.tsx'),
    read('frontend/src/legal/terms-content.ts'),
  ])
  assert.match(router, /'\/termos-de-uso'/)
  assert.match(router, /path === '\/termos'/)
  assert.match(router, /history\.replaceState/)
  for (let section = 1; section <= 26; section += 1) {
    assert.match(terms, new RegExp(`title: '${section}\\.`), `seção ${section} ausente`)
  }
  assert.match(page, /window\.print\(\)/)
  assert.match(page, /Baixar em HTML/)
  assert.match(page, /navigator\.clipboard/)
})

test('clickwrap e maioridade começam desmarcados e falham fechados', async () => {
  const [gate, auth, plans] = await Promise.all([
    read('frontend/src/components/LegalAcceptanceGate.tsx'),
    read('frontend/src/components/AuthGate.tsx'),
    read('frontend/src/legal/PublicLegalRouter.tsx'),
  ])
  assert.match(gate, /useState\(false\)/)
  assert.match(gate, /Tenho 18 anos ou mais/)
  assert.match(gate, /Sair da plataforma/)
  assert.match(gate, /O acesso permanece bloqueado/)
  assert.match(gate, /refreshed\.requiresAcceptance/)
  assert.match(auth, /disabled=\{!accessPrecheck\}/)
  assert.doesNotMatch(`${gate}\n${auth}\n${plans}`, /defaultChecked/)
  assert.match(plans, /Contratação indisponível/)
  assert.match(plans, /<button type="button" disabled>/)
})

test('avisos possuem todas as variantes e análise trata dados insuficientes', async () => {
  const [warnings, analysis, list] = await Promise.all([
    read('frontend/src/legal/risk-warnings.ts'),
    read('frontend/src/components/AnalysisPanel.tsx'),
    read('frontend/src/components/MatchList.tsx'),
  ])
  for (const variant of ['full', 'summary', 'compact', 'modal', 'checkbox', 'footer', 'plans', 'analysis', 'social']) {
    assert.match(warnings, new RegExp(`\\b${variant}:`), `variante ${variant} ausente`)
  }
  assert.match(analysis, /insufficientDataNotice/)
  assert.match(list, /Eventos esportivos são imprevisíveis/)
})

test('hash publicado corresponde aos artefatos jurídicos e aceite não recebe horário do cliente', async () => {
  const [config, terms, policy, risk, route, migration] = await Promise.all([
    read('frontend/src/legal/legal-config.ts'),
    read('frontend/src/legal/terms-content.ts'),
    read('frontend/src/legal/policy-content.ts'),
    read('frontend/src/legal/risk-warnings.ts'),
    read('backend/src/interfaces/http/fastify/routes/legal.ts'),
    read('backend/migrations/0009_legal_acceptance.sql'),
  ])
  const digest = (value) => createHash('sha256').update(value).digest('hex')
  assert.match(config, new RegExp(digest(terms)))
  assert.match(config, new RegExp(digest(policy)))
  assert.match(config, new RegExp(digest(risk)))
  assert.doesNotMatch(route, /acceptedAt:\s*request\.body/)
  assert.match(migration, /"accepted_at" timestamp with time zone DEFAULT now\(\)/)
  assert.match(migration, /legal acceptance evidence cannot be deleted/)
})

test('layout jurídico inclui responsividade, impressão e foco visível por teclado', async () => {
  const css = await read('frontend/src/legal/LegalPages.module.css')
  assert.match(css, /@media \(max-width: 620px\)/)
  assert.match(css, /@media print/)
  assert.match(css, /:focus-visible/)
})
