import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import {
  loadDataOperations,
  resolveDataQualityIssue,
  reviewTeamAlias,
  type DataFreshnessSummary,
  type DataQualityIssue,
  type TeamAliasReview,
} from '../lib/api'
import styles from './DataOperationsPanel.module.css'

export default function DataOperationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { getAccessTokenSilently } = useAuth0()
  const [issues, setIssues] = useState<DataQualityIssue[]>([])
  const [aliases, setAliases] = useState<TeamAliasReview[]>([])
  const [freshness, setFreshness] = useState<DataFreshnessSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => loadDataOperations(getAccessTokenSilently).then((data) => {
    setIssues(data.issues)
    setAliases(data.aliases)
    setFreshness(data.freshness)
    setError(null)
  }).catch((value) => setError(value instanceof Error ? value.message : 'Falha ao carregar operação de dados.'))

  useEffect(() => {
    if (open) void refresh()
  }, [open])

  if (!open) return null

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await operation()
      await refresh()
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Operação não concluída.')
    } finally {
      setBusy(false)
    }
  }

  return <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
    <section className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="data-operations-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><h2 id="data-operations-title">Operação de dados</h2><p>Revisão interna de frescor, aliases ambíguos e registros rejeitados.</p></div><button type="button" onClick={onClose}>Fechar</button></header>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.freshness}>
        <strong>Frescor</strong>
        <span className={styles.ok}>{freshness?.current ?? 0} atuais</span>
        <span className={(freshness?.stale ?? 0) > 0 ? styles.bad : ''}>{freshness?.stale ?? 0} vencidos</span>
        <span>{freshness?.missingTimestamp ?? 0} sem timestamp</span>
      </div>

      <h3>Aliases pendentes</h3>
      <div className={styles.list}>{aliases.length === 0 ? <p>Nenhum alias pendente.</p> : aliases.map((alias) => <article key={alias.id}>
        <div><strong>{alias.alias}</strong><span>{alias.sourceProvider} → {alias.canonicalName}</span></div>
        <div className={styles.actions}><button disabled={busy} onClick={() => void run(() => reviewTeamAlias(getAccessTokenSilently, alias.id, 'approved'))}>Aprovar</button><button className={styles.reject} disabled={busy} onClick={() => void run(() => reviewTeamAlias(getAccessTokenSilently, alias.id, 'rejected'))}>Rejeitar</button></div>
      </article>)}</div>

      <h3>Registros e ambiguidades</h3>
      <div className={styles.list}>{issues.length === 0 ? <p>Nenhum registro aberto.</p> : issues.map((issue) => <article key={issue.id}>
        <div><strong>{issue.issueType}</strong><span>{issue.sourceProvider} · {issue.externalId ?? 'sem identificador'}</span><small>{issue.message}</small></div>
        <button disabled={busy} onClick={() => void run(() => resolveDataQualityIssue(getAccessTokenSilently, issue.id))}>Marcar revisado</button>
      </article>)}</div>
    </section>
  </div>
}
