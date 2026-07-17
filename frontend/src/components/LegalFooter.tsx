import RiskWarning from './RiskWarning'
import styles from './LegalFooter.module.css'

export default function LegalFooter() {
  return (
    <footer className={styles.footer}>
      <RiskWarning variant="footer" />
      <nav aria-label="Links jurídicos">
        <a href="/termos-de-uso">Termos</a>
        <a href="/politica-de-privacidade">Privacidade</a>
        <a href="/cancelamento-e-reembolso">Cancelamento</a>
        <a href="/uso-aceitavel">Uso aceitável</a>
        <a href="/jogo-responsavel">Jogo responsável</a>
      </nav>
    </footer>
  )
}
