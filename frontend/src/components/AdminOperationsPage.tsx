import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import {
  createIncident,
  loadAdminOperations,
  updateAdminTicket,
  type IncidentRecord,
  type SupportSeverity,
  type SupportTicket,
} from '../lib/saasApi'
import AsyncState from './AsyncState'
import styles from './WorkspacePage.module.css'

export default function AdminOperationsPage() {
  const { getAccessTokenSilently } = useAuth0()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [incidents, setIncidents] = useState<IncidentRecord[]>([])
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([])
  const [queues, setQueues] = useState<Array<Record<string, unknown>>>([])
  const [severity, setSeverity] = useState<SupportSeverity>('sev2')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  const reload = async (signal?: AbortSignal) => {
    const result = await loadAdminOperations(getAccessTokenSilently, signal)
    setTickets(result.tickets); setIncidents(result.incidents); setAudit(result.audit); setQueues(result.queues)
  }
  useEffect(() => { const controller = new AbortController(); void reload(controller.signal).catch((value) => setError(message(value))).finally(() => setBusy(false)); return () => controller.abort() }, [getAccessTokenSilently])

  const openIncident = async () => {
    setBusy(true); setError(null)
    try {
      const incident = await createIncident(getAccessTokenSilently, { severity, title, summary, ownerTeam: severity === 'sev1' ? 'security' : 'engineering' })
      setIncidents((current) => [incident, ...current]); setTitle(''); setSummary('')
    } catch (value) { setError(message(value)) } finally { setBusy(false) }
  }

  const takeTicket = async (ticket: SupportTicket) => {
    const updated = await updateAdminTicket(getAccessTokenSilently, ticket.id, 'in_progress', ticket.ownerTeam)
    setTickets((current) => current.map((item) => item.id === updated.id ? updated : item))
  }

  return <main className={styles.page} id="workspace-main" tabIndex={-1}>
    <header className={styles.header}><div><p className={styles.eyebrow}>CONTROL PLANE / ACESSO AUDITADO</p><h1>Operacao interna</h1><p>Somente subjects Auth0 permitidos. Leituras e alteracoes geram trilha de auditoria.</p></div></header>
    {error && <AsyncState kind="error" title="Control plane indisponivel" detail={error} />}
    {busy && tickets.length === 0 && incidents.length === 0 ? <AsyncState kind="loading" title="Carregando operacao" /> : <div className={styles.grid}>
      <section className={`${styles.card} ${styles.wide}`}><h2>Chamados</h2><div className={styles.list}>{tickets.map((ticket) => <div className={styles.row} key={ticket.id}><div className={styles.rowInfo}><strong>{ticket.severity} · {ticket.subject}</strong><span>{ticket.status} · dono {ticket.ownerTeam}</span></div>{ticket.status === 'open' && <button type="button" onClick={() => void takeTicket(ticket)}>Assumir</button>}</div>)}</div></section>
      <section className={`${styles.card} ${styles.wide} ${styles.form}`}><h2>Declarar incidente</h2><label>Severidade<select value={severity} onChange={(event) => setSeverity(event.target.value as SupportSeverity)}><option>sev1</option><option>sev2</option><option>sev3</option><option>sev4</option></select></label><label>Titulo<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Resumo sem PII<textarea rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} /></label><button type="button" disabled={busy || title.length < 5 || summary.length < 10} onClick={() => void openIncident()}>Registrar incidente</button></section>
      <section className={styles.card}><h2>Incidentes</h2><div className={styles.list}>{incidents.map((incident) => <div className={styles.row} key={incident.id}><div className={styles.rowInfo}><strong>{incident.severity} · {incident.title}</strong><span>{incident.status} · {incident.ownerTeam}</span></div></div>)}</div></section>
      <section className={styles.card}><h2>Filas</h2><pre>{JSON.stringify(queues, null, 2)}</pre></section>
      <section className={`${styles.card} ${styles.wide}`}><h2>Auditoria recente</h2><pre>{JSON.stringify(audit, null, 2)}</pre></section>
    </div>}
  </main>
}

function message(value: unknown) { return value instanceof Error ? value.message : 'Falha inesperada.' }
