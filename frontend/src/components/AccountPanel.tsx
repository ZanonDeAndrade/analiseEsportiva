import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { authenticatedFetchJson, invalidateApiCache } from '../lib/api'
import type { LegalAcceptanceEvidence } from '../lib/api'
import { deleteOrganizationData, exportSubjectData } from '../lib/saasApi'
import styles from './AccountPanel.module.css'

interface MeResponse {
  userId: string
  organizationId: string
  role: string
  sessionId: string
}

interface SessionResponse {
  id: string
  createdAt?: string
  authenticatedAt?: string
  expiresAt?: string
  lastSeenAt?: string
  userAgent?: string
  current?: boolean
  revokedAt?: string
}

interface BillingStatus {
  configured: boolean
  subscription: null | {
    planName: string
    status: string
    priceMinor: number
    currency: string
    interval: 'month' | 'year'
    currentPeriodEnd: string
    cancelAtPeriodEnd: boolean
    refundPolicy: string
  }
}

export default function AccountPanel({ open, onClose, mode = 'dialog' }: { open: boolean; onClose: () => void; mode?: 'dialog' | 'page' }) {
  const { getAccessTokenSilently, loginWithRedirect, logout } = useAuth0()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [sessions, setSessions] = useState<SessionResponse[]>([])
  const [acceptances, setAcceptances] = useState<LegalAcceptanceEvidence[]>([])
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [cancellationMessage, setCancellationMessage] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [replacementOwnerUserId, setReplacementOwnerUserId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)
    Promise.all([
      authenticatedFetchJson<MeResponse>('/v1/me', getAccessTokenSilently),
      authenticatedFetchJson<{ sessions: SessionResponse[] }>(
        '/v1/account/sessions',
        getAccessTokenSilently,
      ),
      authenticatedFetchJson<{ acceptances: LegalAcceptanceEvidence[] }>(
        '/v1/legal/acceptances',
        getAccessTokenSilently,
      ),
      authenticatedFetchJson<BillingStatus>('/v1/billing/subscription', getAccessTokenSilently),
    ])
      .then(([profile, sessionPayload, acceptancePayload, billingPayload]) => {
        if (cancelled) return
        setMe(profile)
        setSessions(sessionPayload.sessions)
        setAcceptances(acceptancePayload.acceptances)
        setBilling(billingPayload)
      })
      .catch((caught) => {
        if (!cancelled) setError(message(caught))
      })
    return () => {
      cancelled = true
    }
  }, [getAccessTokenSilently, open])

  useEffect(() => {
    if (!open || mode !== 'dialog') return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mode, onClose, open])

  if (!open) return null

  const revoke = async (session: SessionResponse) => {
    setBusy(true)
    setError(null)
    try {
      await authenticatedFetchJson<void>(
        `/v1/account/sessions/${encodeURIComponent(session.id)}`,
        getAccessTokenSilently,
        { method: 'DELETE' },
      )
      if (session.current) {
        await logout({ logoutParams: { returnTo: window.location.origin } })
      } else {
        setSessions((current) => current.filter((item) => item.id !== session.id))
      }
    } catch (caught) {
      setError(message(caught))
    } finally {
      setBusy(false)
    }
  }

  const changeEmail = async () => {
    setBusy(true)
    setError(null)
    try {
      await authenticatedFetchJson('/v1/account/email-change', getAccessTokenSilently, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      await logout({ logoutParams: { returnTo: window.location.origin } })
    } catch (caught) {
      setError(message(caught))
    } finally {
      setBusy(false)
    }
  }

  const accountAction = async (action: 'deactivate' | 'delete') => {
    if (!window.confirm(action === 'delete' ? 'Excluir permanentemente a conta?' : 'Desativar a conta?')) return
    setBusy(true)
    setError(null)
    if (action === 'delete') invalidateApiCache()
    try {
      await authenticatedFetchJson<void>(
        action === 'delete' ? '/v1/account' : '/v1/account/deactivate',
        getAccessTokenSilently,
        {
          method: action === 'delete' ? 'DELETE' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ replacementOwnerUserId: replacementOwnerUserId || undefined }),
        },
      )
      invalidateApiCache()
      await logout({ logoutParams: { returnTo: window.location.origin } })
    } catch (caught) {
      setError(message(caught))
      if (action === 'delete') await logout({ logoutParams: { returnTo: window.location.origin } })
    } finally {
      setBusy(false)
    }
  }

  const exportPrivacyData = async () => {
    setBusy(true); setError(null)
    try { await exportSubjectData(getAccessTokenSilently) }
    catch (caught) { setError(message(caught)) }
    finally { setBusy(false) }
  }

  const eraseOrganization = async () => {
    if (me?.role !== 'owner') return
    const confirmation = window.prompt('Para excluir os dados ativos da organizacao, digite EXCLUIR ORGANIZACAO')
    if (confirmation !== 'EXCLUIR ORGANIZACAO') return
    setBusy(true); setError(null)
    try {
      await deleteOrganizationData(getAccessTokenSilently)
      invalidateApiCache()
      await logout({ logoutParams: { returnTo: window.location.origin } })
    } catch (caught) { setError(message(caught)) }
    finally { setBusy(false) }
  }

  const exportAcceptance = async (acceptance: LegalAcceptanceEvidence) => {
    setBusy(true)
    setError(null)
    try {
      const evidence = await authenticatedFetchJson<Record<string, unknown>>(
        `/v1/legal/acceptances/${encodeURIComponent(acceptance.id)}/export`,
        getAccessTokenSilently,
      )
      const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `betintel-aceite-${acceptance.documentType}-v${acceptance.documentVersion}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(message(caught))
    } finally {
      setBusy(false)
    }
  }

  const cancelSubscription = async () => {
    const subscription = billing?.subscription
    if (!subscription) return
    const confirmed = window.confirm(
      `Cancelar o plano ${subscription.planName}? A solicitação interromperá a renovação automática. O acesso previsto permanece até ${formatDate(subscription.currentPeriodEnd)}. Reembolso: ${subscription.refundPolicy}.`,
    )
    if (!confirmed) return
    setBusy(true)
    setError(null)
    try {
      const result = await authenticatedFetchJson<{
        confirmation: string
        cancellation: { notificationStatus: string }
      }>('/v1/billing/subscription/cancel', getAccessTokenSilently, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
      })
      setCancellationMessage(`${result.confirmation} Confirmação por e-mail: ${result.cancellation.notificationStatus === 'sent' ? 'enviada' : 'não configurada ou não confirmada'}.`)
      setBilling((current) => current?.subscription ? {
        ...current,
        subscription: { ...current.subscription, cancelAtPeriodEnd: true },
      } : current)
    } catch (caught) {
      setError(message(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div id={mode === 'page' ? 'workspace-main' : undefined} tabIndex={mode === 'page' ? -1 : undefined} className={`${styles.backdrop} ${mode === 'page' ? styles.backdropPage : ''}`} role="presentation" onMouseDown={mode === 'dialog' ? onClose : undefined}>
      <section className={`${styles.panel} ${mode === 'page' ? styles.panelPage : ''}`} role={mode === 'dialog' ? 'dialog' : 'region'} aria-modal={mode === 'dialog' ? 'true' : undefined} aria-label="Conta e seguranca" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2>Segurança da conta</h2>
            <small>Usuário {me?.userId ?? '…'} · organização {me?.organizationId ?? '…'}</small>
          </div>
          <button type="button" onClick={onClose}>{mode === 'page' ? 'Voltar aos jogos' : 'Fechar'}</button>
        </header>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.accountGrid}>
          <section className={`${styles.accountSection} ${styles.wideSection}`}>
            <h3>Sessões e dispositivos</h3>
            <div className={styles.sessions}>
              {sessions.map((session) => (
                <div key={session.id} className={styles.session}>
                  <div>
                    <b>{session.current ? 'Sessão atual' : 'Outro dispositivo'}</b>
                    <span>{session.userAgent ?? 'Dispositivo não informado'}</span>
                    <small>Última atividade: {formatDate(session.lastSeenAt)}</small>
                  </div>
                  <button type="button" disabled={busy} onClick={() => void revoke(session)}>Revogar</button>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.accountSection}>
            <h3>Operações sensíveis</h3>
            <p className={styles.help}>Reautentique no Universal Login antes de alterar e-mail, desativar ou excluir.</p>
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => void loginWithRedirect({
                  authorizationParams: { max_age: 0, prompt: 'login' },
                  appState: { returnTo: `${window.location.pathname}?account=1` },
                })}
              >
                Reautenticar
              </button>

              <button
                type="button"
                className={styles.secondary}
                onClick={() => void loginWithRedirect({
                  authorizationParams: {
                    max_age: 0,
                    prompt: 'login',
                    acr_values: 'http://schemas.openid.net/pape/policies/2007/06/multi-factor',
                  },
                  appState: { returnTo: `${window.location.pathname}?view=account` },
                })}
              >
                Validar acesso com MFA
              </button>
            </div>

            <label>
              Novo e-mail
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
            </label>
            <button type="button" disabled={busy || !email} onClick={() => void changeEmail()}>
              Solicitar alteração e confirmação
            </button>

            <label>
              ID interno do novo proprietário, se necessário
              <input value={replacementOwnerUserId} onChange={(event) => setReplacementOwnerUserId(event.target.value)} />
            </label>
            <div className={styles.dangerActions}>
              <button type="button" disabled={busy} onClick={() => void accountAction('deactivate')}>Desativar</button>
              <button type="button" disabled={busy} onClick={() => void accountAction('delete')}>Excluir conta</button>
            </div>
          </section>

          <section className={styles.accountSection}>
            <h3>Privacidade e direitos do titular</h3>
            <p className={styles.help}>A exportacao e gerada sob sua identidade atual, inclui todos os tenants vinculados e recebe cabecalho no-store. Nao compartilhe o arquivo.</p>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => void exportPrivacyData()}>Exportar meus dados</button>
            <p className={styles.help}>Para corrigir nome ou e-mail, use o Auth0 e a sincronizacao de perfil. Divergencias adicionais podem ser registradas em Ajuda e suporte, categoria Privacidade.</p>
            {me?.role === 'owner' && <button type="button" className={styles.danger} disabled={busy} onClick={() => void eraseOrganization()}>Excluir dados ativos da organizacao</button>}
            <p className={styles.help}>Billing, aceites e auditoria podem permanecer pseudonimizados conforme obrigacoes aplicaveis. Prazos e bases legais exigem revisao juridica/contabil profissional.</p>
          </section>

          <section className={styles.accountSection}>
            <h3>Assinatura e cancelamento</h3>
            {!billing?.configured && <p className={styles.help}>Nenhum gateway de pagamento está ativo. Não há assinatura recorrente administrável por esta aplicação.</p>}
            {billing?.subscription && <div className={styles.subscription}>
              <b>{billing.subscription.planName}</b>
              <span>{formatMoney(billing.subscription.priceMinor, billing.subscription.currency)} por {billing.subscription.interval === 'month' ? 'mês' : 'ano'}</span>
              <span>Acesso do período atual até {formatDate(billing.subscription.currentPeriodEnd)}</span>
              <span>Reembolso: {billing.subscription.refundPolicy}</span>
              <button type="button" disabled={busy || billing.subscription.cancelAtPeriodEnd} onClick={() => void cancelSubscription()}>
                {billing.subscription.cancelAtPeriodEnd ? 'Renovação já interrompida' : 'Cancelar renovação automática'}
              </button>
            </div>}
            {cancellationMessage && <p className={styles.success}>{cancellationMessage}</p>}
          </section>

          <section className={styles.accountSection}>
            <h3>Documentos e evidências de aceite</h3>
            <p className={styles.help}>Cada registro identifica a versão e o hash aceitos. A exportação não contém o endereço IP bruto.</p>
            <div className={styles.acceptances}>
              {acceptances.map((acceptance) => (
                <div key={acceptance.id} className={styles.acceptance}>
                  <div><b>{acceptance.documentType} v{acceptance.documentVersion}</b><small>{formatDate(acceptance.acceptedAt)} · {acceptance.contentHash.slice(0, 12)}…</small></div>
                  <div className={styles.acceptanceActions}>
                    <a href={acceptance.documentUrl} target="_blank" rel="noreferrer">Abrir versão aceita</a>
                    <button type="button" disabled={busy} onClick={() => void exportAcceptance(acceptance)}>Exportar evidência</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <p className={`${styles.help} ${styles.securityFootnote}`}>
            Senha, TOTP e códigos de recuperação são administrados pelo Auth0 e nunca são exibidos novamente pelo BetIntel AI.
          </p>
        </div>
      </section>
    </div>
  )
}

function formatDate(value: string | undefined) {
  if (!value) return 'n/d'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'n/d' : parsed.toLocaleString('pt-BR')
}

function message(value: unknown) {
  return value instanceof Error ? value.message : 'Não foi possível concluir a operação.'
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value / 100)
}
