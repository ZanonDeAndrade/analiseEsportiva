import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { authenticatedFetchJson } from '../lib/api'
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

export default function AccountPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { getAccessTokenSilently, loginWithRedirect, logout } = useAuth0()
  const [me, setMe] = useState<MeResponse | null>(null)
  const [sessions, setSessions] = useState<SessionResponse[]>([])
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
    ])
      .then(([profile, sessionPayload]) => {
        if (cancelled) return
        setMe(profile)
        setSessions(sessionPayload.sessions)
      })
      .catch((caught) => {
        if (!cancelled) setError(message(caught))
      })
    return () => {
      cancelled = true
    }
  }, [getAccessTokenSilently, open])

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
      await logout({ logoutParams: { returnTo: window.location.origin } })
    } catch (caught) {
      setError(message(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
      <section className={styles.panel} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2>Segurança da conta</h2>
            <small>Usuário {me?.userId ?? '…'} · organização {me?.organizationId ?? '…'}</small>
          </div>
          <button type="button" onClick={onClose}>Fechar</button>
        </header>

        {error && <p className={styles.error}>{error}</p>}

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

        <h3>Operações sensíveis</h3>
        <p className={styles.help}>Reautentique no Universal Login antes de alterar e-mail, desativar ou excluir.</p>
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

        <p className={styles.help}>
          Senha, TOTP e códigos de recuperação são administrados pelo Auth0 e nunca são exibidos novamente pelo BetIntel AI.
        </p>
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
