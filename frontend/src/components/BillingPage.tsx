import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { createCheckout, loadBilling, openBillingPortal, type BillingOverview } from '../lib/saasApi'
import { formatDateTime, formatMoney, formatNumber } from '../lib/intl'
import AsyncState from './AsyncState'
import styles from './WorkspacePage.module.css'
import billingStyles from './BillingPage.module.css'

export default function BillingPage() {
  const { getAccessTokenSilently } = useAuth0()
  const [overview, setOverview] = useState<BillingOverview | null>(null)
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month')
  const [recurringBillingAccepted, setRecurringBillingAccepted] = useState(false)
  const checkoutResult = new URLSearchParams(window.location.search).get('checkout')

  const refresh = async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const result = await loadBilling(getAccessTokenSilently, signal)
      setConfigured(result.configured)
      setOverview(result.overview)
    } catch (value) {
      if (!(value instanceof DOMException && value.name === 'AbortError')) setError(message(value))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => controller.abort()
  }, [])

  const redirect = async (operation: () => Promise<{ url: string }>) => {
    setBusy(true)
    setError(null)
    try {
      window.location.assign((await operation()).url)
    } catch (value) {
      setError(message(value))
      setBusy(false)
    }
  }

  const visiblePlans = overview?.plans.filter((plan) => plan.interval === billingInterval) ?? []

  return <main className={styles.page} id="workspace-main" tabIndex={-1}>
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>PLANOS BETINTEL AI</p>
        <h1>Escolha o acesso ideal</h1>
        <p>Compare as ligas incluídas em cada plano. As análises são probabilísticas, educacionais e não garantem resultados.</p>
      </div>
    </header>

    {error && <p className={styles.error} role="alert">{error}</p>}
    {checkoutResult === 'success' && <p className={styles.notice} role="status">Checkout concluído. A assinatura será exibida após a confirmação assinada do Stripe.</p>}
    {checkoutResult === 'cancelled' && <p className={styles.notice} role="status">Checkout cancelado. Nenhuma nova assinatura foi confirmada.</p>}
    {loading
      ? <AsyncState kind="loading" title="Carregando planos" detail="Consultando o catálogo e a assinatura da conta." />
      : !overview
        ? <AsyncState kind="error" title="Planos indisponíveis" detail="O servidor não retornou o catálogo de planos." />
        : <>
          {!configured && <div className={billingStyles.activationNote} role="status">
            <strong>Catálogo disponível</strong>
            <span>Os valores já estão definidos. O checkout será liberado depois da configuração do gateway e das validações comercial, fiscal e jurídica.</span>
          </div>}

          <section className={billingStyles.catalog} aria-labelledby="catalogo-planos">
            <div className={billingStyles.catalogIntro}>
              <div className={billingStyles.catalogCopy}>
                <span className={billingStyles.kicker}>{billingInterval === 'month' ? 'ASSINATURA MENSAL' : 'ASSINATURA ANUAL'}</span>
                <h2 id="catalogo-planos">Planos simples, sem esconder o escopo</h2>
                <p>Comece pelo Brasileirão ou libere todas as cinco ligas disponíveis.</p>
              </div>
              <div className={billingStyles.cycleSelector}>
                <span>PERÍODO DE COBRANÇA</span>
                <div className={billingStyles.cycleToggle} role="group" aria-label="Período de cobrança">
                  <button type="button" className={billingInterval === 'month' ? billingStyles.cycleActive : ''} aria-pressed={billingInterval === 'month'} onClick={() => setBillingInterval('month')}>Mensal</button>
                  <button type="button" className={billingInterval === 'year' ? billingStyles.cycleActive : ''} aria-pressed={billingInterval === 'year'} onClick={() => setBillingInterval('year')}>Anual</button>
                </div>
                <small>No anual, economize R$ 60,00 no período.</small>
              </div>
            </div>

            {visiblePlans.length === 0
              ? <AsyncState kind="error" title="Planos ainda não publicados" detail={`O servidor não retornou opções de cobrança ${billingInterval === 'year' ? 'anual' : 'mensal'}. Atualize o backend antes de oferecer este período.`} />
              : <div className={billingStyles.planGrid}>
              {visiblePlans.map((plan) => <article className={`${billingStyles.plan} ${plan.recommended ? billingStyles.recommended : ''}`} key={plan.planKey}>
                <div className={billingStyles.planHeader}>
                  <span className={billingStyles.planCode}>{productKeyOf(plan) === 'brasileirao' ? 'BRASIL' : 'COMPLETO'}</span>
                  {plan.recommended && <span className={billingStyles.badge}>Melhor custo-benefício</span>}
                </div>
                <div>
                  <h3>{plan.name}</h3>
                  <p className={billingStyles.description}>{plan.description}</p>
                </div>
                <div className={billingStyles.priceArea}>
                  <div className={billingStyles.price}>
                    <strong>{formatMoney(monthlyEquivalentOf(plan), plan.currency)}</strong>
                    <span>/mês</span>
                  </div>
                  <p className={billingStyles.billingDetail}>
                    {plan.interval === 'year'
                      ? <>Cobrança anual de <strong>{formatMoney(plan.priceMinor, plan.currency)}</strong>.</>
                      : <>Cobrança mensal recorrente de <strong>{formatMoney(plan.priceMinor, plan.currency)}</strong>.</>}
                  </p>
                  {plan.savingsMinor > 0 && <span className={billingStyles.savings}>Economize {formatMoney(plan.savingsMinor, plan.currency)} por ano</span>}
                </div>
                <ul className={billingStyles.features}>
                  {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
                <div className={billingStyles.planFooter}>
                  <small>{scopeLabel(plan.entitlements)}</small>
                  <button className={styles.button} disabled={busy || !configured || !recurringBillingAccepted} onClick={() => void redirect(() => createCheckout(getAccessTokenSilently, plan.planKey, recurringBillingAccepted))}>
                    {configured ? 'Assinar plano' : 'Checkout em breve'}
                  </button>
                </div>
              </article>)}
            </div>}
            <label className={billingStyles.billingConsent}>
              <input
                type="checkbox"
                checked={recurringBillingAccepted}
                disabled={!configured || busy}
                onChange={(event) => setRecurringBillingAccepted(event.target.checked)}
              />
              <span>Confirmo que tenho 18 anos ou mais, li os <a href="/termos-de-uso" target="_blank" rel="noreferrer">Termos</a>, a <a href="/politica-de-privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a>, o aviso de risco e autorizo a cobrança recorrente do plano escolhido até o cancelamento.</span>
            </label>
            <p className={billingStyles.disclaimer}>A assinatura concede acesso ao conteúdo estatístico do plano. Não inclui recomendação de aposta nem promessa de acerto.</p>
          </section>

          <div className={`${styles.grid} ${billingStyles.accountGrid}`}>
            <section className={styles.card}>
              <h2>Assinatura atual</h2>
              {overview.subscription
                ? <div className={billingStyles.subscription}>
                  <strong>{overview.subscription.planName}</strong>
                  <span>{formatMoney(overview.subscription.priceMinor, overview.subscription.currency)} / {overview.subscription.interval === 'month' ? 'mês' : 'ano'}</span>
                  <span className={styles.status}>{overview.subscription.status}</span>
                  <small>Período atual até {formatDateTime(overview.subscription.currentPeriodEnd)}</small>
                  {overview.subscription.cancelAtPeriodEnd && <p className={styles.notice}>A renovação automática está interrompida.</p>}
                </div>
                : <AsyncState kind="empty" title="Sem assinatura ativa" detail="Escolha um plano quando o checkout estiver disponível." />}
              <button className={`${styles.secondary} ${billingStyles.portalButton}`} disabled={busy || !configured || !overview.subscription} onClick={() => void redirect(() => openBillingPortal(getAccessTokenSilently))}>Abrir portal de cobrança</button>
            </section>

            <section className={styles.card}>
              <h2>Uso do período</h2>
              <p>A porcentagem aparece somente quando o servidor informa um limite.</p>
              {overview.usage.length === 0
                ? <AsyncState kind="empty" title="Sem uso publicado" detail="Nenhum medidor foi informado para o período atual." />
                : <div className={billingStyles.usageList}>{overview.usage.map((usage) => {
                  const ratio = usage.limit && usage.limit > 0 ? Math.min(100, usage.quantity / usage.limit * 100) : undefined
                  return <div className={billingStyles.usage} key={`${usage.metric}-${usage.periodStart}`}>
                    <div><strong>{usage.metric}</strong><span>{formatNumber(usage.quantity)}{usage.limit === undefined ? ' · limite não publicado' : ` de ${formatNumber(usage.limit)}`}</span></div>
                    {ratio !== undefined && <>
                      <div className={billingStyles.scale} aria-label={`${ratio.toFixed(1)} por cento do limite`}><span style={{ width: `${ratio}%` }} /></div>
                      <div className={billingStyles.axis}><span>0</span><span>{formatNumber(usage.limit!)}</span></div>
                    </>}
                    <small>{formatDateTime(usage.periodStart)} — {formatDateTime(usage.periodEnd)}</small>
                  </div>
                })}</div>}
            </section>

            <section className={`${styles.card} ${styles.wide}`}>
              <h2>Faturas</h2>
              {overview.invoices.length === 0
                ? <AsyncState kind="empty" title="Nenhuma fatura" detail="Ainda não existem faturas para esta conta." />
                : <div className={styles.list}>{overview.invoices.map((invoice) => <article className={styles.row} key={invoice.id}>
                  <div className={styles.rowInfo}><strong>{formatMoney(invoice.amountDueMinor, invoice.currency)}</strong><span>Pago: {formatMoney(invoice.amountPaidMinor, invoice.currency)}</span><small>Criada em {formatDateTime(invoice.createdAt)}</small></div>
                  <span className={styles.status}>{invoice.status}</span>
                </article>)}</div>}
            </section>
          </div>
        </>}
  </main>
}

function message(value: unknown) {
  return value instanceof Error ? value.message : 'Não foi possível carregar a cobrança.'
}

function scopeLabel(entitlements: Record<string, unknown>) {
  const leagues = Array.isArray(entitlements.leagueIds) ? entitlements.leagueIds.length : 0
  return leagues === 1 ? '1 liga incluída' : `${leagues} ligas incluídas`
}

function monthlyEquivalentOf(plan: BillingOverview['plans'][number]) {
  return Number.isFinite(plan.monthlyEquivalentMinor) ? plan.monthlyEquivalentMinor : plan.priceMinor
}

function productKeyOf(plan: BillingOverview['plans'][number]) {
  return plan.productKey ?? (plan.planKey.startsWith('brasileirao') ? 'brasileirao' : 'todas-ligas')
}
