import styles from './OperationalUnavailable.module.css'

export function operationalUnavailableEnabled() {
  return import.meta.env.VITE_OPERATIONAL_UNAVAILABLE === 'true'
}

export default function OperationalUnavailable() {
  const message = (import.meta.env.VITE_OPERATIONAL_UNAVAILABLE_MESSAGE as string | undefined)?.trim()
  return <main className={styles.screen}>
    <section className={styles.card} role="status">
      <p className={styles.code}>OPERACAO / FEATURE FLAG ATIVA</p>
      <h1>Plataforma temporariamente indisponivel</h1>
      <p>{message || 'Uma pausa operacional controlada esta em andamento. Tente novamente mais tarde.'}</p>
      <small>Esta pagina so aparece quando VITE_OPERATIONAL_UNAVAILABLE=true no artefato implantado. Falhas comuns continuam visiveis como erros e nao acionam esta tela.</small>
      <a href="/termos-de-uso">Consultar termos e avisos</a>
    </section>
  </main>
}
