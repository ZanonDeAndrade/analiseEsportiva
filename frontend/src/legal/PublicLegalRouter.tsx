import { useState } from 'react'
import RiskWarning from '../components/RiskWarning'
import { acceptanceTexts } from './acceptance-texts'
import { legalConfig, legalDraftWarning } from './legal-config'
import LegalDocumentPage from './LegalDocumentPage'
import {
  acceptableUseContent,
  privacyContent,
  refundContent,
  responsibleGamingContent,
} from './policy-content'
import { termsContent } from './terms-content'
import styles from './LegalPages.module.css'

export const publicLegalPaths = new Set([
  '/termos-de-uso', '/termos', '/politica-de-privacidade', '/cancelamento-e-reembolso',
  '/uso-aceitavel', '/jogo-responsavel', '/planos',
])

export function isPublicLegalPath(pathname: string) {
  return publicLegalPaths.has(normalizePath(pathname))
}

export default function PublicLegalRouter() {
  let path = normalizePath(window.location.pathname)
  if (path === '/termos') {
    path = '/termos-de-uso'
    window.history.replaceState({}, document.title, `${path}${window.location.search}${window.location.hash}`)
  }
  if (path === '/planos') return <PlansPage />
  const mapping = {
    '/termos-de-uso': termsContent,
    '/politica-de-privacidade': privacyContent,
    '/cancelamento-e-reembolso': refundContent,
    '/uso-aceitavel': acceptableUseContent,
    '/jogo-responsavel': responsibleGamingContent,
  } as const
  const content = mapping[path as keyof typeof mapping] ?? termsContent
  return <LegalDocumentPage content={content} showRisk={path === '/termos-de-uso'} />
}

function PlansPage() {
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [recurringAccepted, setRecurringAccepted] = useState(false)
  const [marketingAccepted, setMarketingAccepted] = useState(false)
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month')
  const annual = billingInterval === 'year'
  return (
    <main className={styles.plansPage}>
      <a className={styles.brand} href="/">BetIntel <span>AI</span></a>
      <div className={styles.draft} role="alert">{legalDraftWarning}</div>
      <h1>Planos e condições comerciais</h1>
      <p>Planos: {legalConfig.plans.names}. Valores: {legalConfig.plans.values}.</p>
      <div className={styles.publicCycle}>
        <span>Período de cobrança</span>
        <div role="group" aria-label="Período de cobrança">
          <button type="button" className={!annual ? styles.publicCycleActive : ''} aria-pressed={!annual} onClick={() => setBillingInterval('month')}>Mensal</button>
          <button type="button" className={annual ? styles.publicCycleActive : ''} aria-pressed={annual} onClick={() => setBillingInterval('year')}>Anual</button>
        </div>
        <small>No anual, o valor exibido por mês é equivalente; a cobrança ocorre uma vez por ano.</small>
      </div>
      <section className={styles.publicPlanGrid} aria-label="Planos disponíveis">
        <article>
          <span>BRASIL</span>
          <h2>Plano Brasileirão</h2>
          <strong>{annual ? 'R$ 14,90' : 'R$ 19,90'} <small>/mês</small></strong>
          <small className={styles.publicBillingDetail}>{annual ? 'Cobrado R$ 178,80 por ano · economia de R$ 60,00' : 'Cobrança mensal recorrente de R$ 19,90'}</small>
          <p>Acesso exclusivo ao Brasileirão Série A e às análises probabilísticas dos jogos.</p>
        </article>
        <article className={styles.featuredPlan}>
          <span>COMPLETO</span>
          <h2>Plano Todas as Ligas</h2>
          <strong>{annual ? 'R$ 34,90' : 'R$ 39,90'} <small>/mês</small></strong>
          <small className={styles.publicBillingDetail}>{annual ? 'Cobrado R$ 418,80 por ano · economia de R$ 60,00' : 'Cobrança mensal recorrente de R$ 39,90'}</small>
          <p>Brasileirão, Premier League, La Liga, Ligue 1 e Bundesliga.</p>
        </article>
      </section>
      <div className={styles.unavailable}>
        <strong>Contratação indisponível</strong>
        <p>O gateway, os impostos, a política de reembolso e as regras de upgrade/downgrade ainda não foram validados. Nenhuma cobrança será iniciada nesta página.</p>
      </div>
      <RiskWarning variant="plans" showLiability />
      <section className={styles.consentPreview} aria-labelledby="aceites-checkout">
        <h2 id="aceites-checkout">Aceites exigidos antes de uma futura contratação</h2>
        <label><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /> <span>{acceptanceTexts.termsAndPrivacy} <a href="/termos-de-uso">Termos</a> · <a href="/politica-de-privacidade">Privacidade</a></span></label>
        <label><input type="checkbox" checked={recurringAccepted} onChange={(event) => setRecurringAccepted(event.target.checked)} /> <span>{acceptanceTexts.recurringBilling}</span></label>
        <label className={styles.optional}><input type="checkbox" checked={marketingAccepted} onChange={(event) => setMarketingAccepted(event.target.checked)} /> <span>Opcional: {acceptanceTexts.marketing}</span></label>
        <button type="button" disabled>Contratação indisponível — checkout em configuração</button>
        <small>Os controles começam desmarcados. Marcar esta prévia não registra aceite nem cria assinatura.</small>
      </section>
      <nav className={styles.policyLinks} aria-label="Políticas aplicáveis">
        <a href="/termos-de-uso">Termos de Uso</a>
        <a href="/politica-de-privacidade">Política de Privacidade</a>
        <a href="/cancelamento-e-reembolso">Cancelamento e Reembolso</a>
        <a href="/uso-aceitavel">Uso Aceitável</a>
      </nav>
    </main>
  )
}

function normalizePath(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}
