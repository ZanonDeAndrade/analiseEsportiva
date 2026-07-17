import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { userLocale, userTimeZone, formatDateTime } from '../lib/intl'
import {
  createSupportTicket,
  loadSupportTickets,
  type SupportCategory,
  type SupportSeverity,
  type SupportTicket,
} from '../lib/saasApi'
import AsyncState from './AsyncState'
import styles from './WorkspacePage.module.css'

const articles = [
  ['Como ler uma probabilidade', 'Use a estimativa junto da amostra, do periodo, do intervalo de confianca e das limitacoes. Ela nao e uma certeza.'],
  ['Mercado indisponivel', 'dados_insuficientes aparece quando colunas ou amostra nao sustentam uma estimativa honesta.'],
  ['Seguranca da conta', 'Revogue dispositivos em Conta e seguranca. Para comprometimento suspeito, abra chamado SEV1 e reautentique.'],
  ['Direitos de privacidade', 'A exportacao completa e a exclusao ficam em Conta e seguranca. Correcao de dados pode ser registrada como chamado de privacidade.'],
]

export default function SupportPage() {
  const { getAccessTokenSilently } = useAuth0()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [category, setCategory] = useState<SupportCategory>('technical')
  const [severity, setSeverity] = useState<SupportSeverity>('sev3')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const supportEmail = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined
  const statusPage = import.meta.env.VITE_STATUS_PAGE_URL as string | undefined

  useEffect(() => {
    const controller = new AbortController()
    loadSupportTickets(getAccessTokenSilently, controller.signal)
      .then((result) => setTickets(result.tickets))
      .catch((value) => { if (!(value instanceof DOMException && value.name === 'AbortError')) setError(message(value)) })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [getAccessTokenSilently])

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      const ticket = await createSupportTicket(getAccessTokenSilently, { category, severity, subject, description })
      setTickets((current) => [ticket, ...current]); setSubject(''); setDescription('')
    } catch (value) { setError(message(value)) } finally { setBusy(false) }
  }

  return <main className={styles.page} id="workspace-main" tabIndex={-1}>
    <header className={styles.header}><div><p className={styles.eyebrow}>SUPORTE / OPERACAO AUDITADA</p><h1>Ajuda e atendimento</h1><p>Abra chamados sem compartilhar senha, token, dados de pagamento ou informacao pessoal desnecessaria.</p></div></header>
    {error && <AsyncState kind="error" title="Nao foi possivel concluir" detail={error} />}
    <div className={styles.grid}>
      <section className={`${styles.card} ${styles.wide} ${styles.form}`}><h2>Novo chamado</h2>
        <label>Categoria<select value={category} onChange={(event) => setCategory(event.target.value as SupportCategory)}><option value="access">Acesso</option><option value="billing">Billing</option><option value="data">Dados incorretos</option><option value="privacy">Privacidade</option><option value="security">Seguranca</option><option value="technical">Tecnico</option><option value="other">Outro</option></select></label>
        <label>Severidade<select value={severity} onChange={(event) => setSeverity(event.target.value as SupportSeverity)}><option value="sev1">SEV1 — indisponibilidade/seguranca critica</option><option value="sev2">SEV2 — impacto alto</option><option value="sev3">SEV3 — impacto moderado</option><option value="sev4">SEV4 — duvida ou melhoria</option></select></label>
        <label>Assunto<input value={subject} maxLength={120} onChange={(event) => setSubject(event.target.value)} /></label>
        <label>Descricao<textarea value={description} maxLength={4000} rows={5} onChange={(event) => setDescription(event.target.value)} /></label>
        <div className={styles.actions}><button type="button" disabled={busy || subject.length < 5 || description.length < 10} onClick={() => void submit()}>Enviar chamado</button></div>
        <p className={styles.notice}>SLA interno de primeira resposta: SEV1 15 min, SEV2 1 h, SEV3 8 h, SEV4 48 h. Nao constitui SLA contratual sem validacao comercial.</p>
      </section>
      <section className={`${styles.card} ${styles.wide}`}><h2>Meus chamados</h2>{busy && tickets.length === 0 ? <AsyncState kind="loading" title="Carregando chamados" /> : tickets.length === 0 ? <AsyncState kind="empty" title="Nenhum chamado" detail="Use o formulario acima quando precisar de atendimento." /> : <div className={styles.list}>{tickets.map((ticket) => <div className={styles.row} key={ticket.id}><div className={styles.rowInfo}><strong>{ticket.subject}</strong><span>{ticket.category} · {ticket.severity} · {ticket.status}</span><small>Responsavel: {ticket.ownerTeam} · resposta ate {formatDateTime(ticket.slaDueAt)}</small></div></div>)}</div>}</section>
      <section className={`${styles.card} ${styles.wide}`}><h2>Base de conhecimento</h2><div className={styles.list}>{articles.map(([title, detail]) => <details className={styles.row} key={title}><summary><strong>{title}</strong></summary><p>{detail}</p></details>)}</div></section>
      <section className={styles.card}><h2>Status publico</h2>{statusPage ? <a href={statusPage} target="_blank" rel="noreferrer">Abrir status independente</a> : <p className={styles.notice}>URL da status page nao configurada neste ambiente.</p>}</section>
      <section className={styles.card}><h2>Outros canais</h2>{supportEmail ? <a href={`mailto:${supportEmail}`}>{supportEmail}</a> : <p className={styles.notice}>E-mail de suporte nao configurado.</p>}<p><code>locale={userLocale}<br />timezone={userTimeZone}</code></p></section>
      <section className={`${styles.card} ${styles.wide}`}><h2>Politicas</h2><p>Templates de privacidade, termos e reembolso exigem revisao juridica obrigatoria.</p><div className={styles.actions}><a className={styles.secondary} href="/termos-de-uso">Termos</a><a className={styles.secondary} href="/politica-de-privacidade">Privacidade</a></div></section>
    </div>
  </main>
}

function message(value: unknown) { return value instanceof Error ? value.message : 'Falha inesperada.' }
