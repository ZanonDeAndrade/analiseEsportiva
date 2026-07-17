import { preservedLiabilityNotice, riskWarnings, type RiskWarningVariant } from '../legal/risk-warnings'
import styles from './RiskWarning.module.css'

export default function RiskWarning({
  variant = 'summary',
  showLiability = false,
  className = '',
}: {
  variant?: RiskWarningVariant
  showLiability?: boolean
  className?: string
}) {
  const compact = variant === 'compact' || variant === 'footer' || variant === 'analysis'
  return (
    <aside
      className={`${styles.warning} ${styles[variant]} ${className}`}
      aria-label="Aviso de risco"
      role={variant === 'modal' ? 'alert' : 'note'}
    >
      {!compact && <strong>Aviso de risco — 18+</strong>}
      <p>{riskWarnings[variant]}</p>
      {showLiability && <p className={styles.liability}>{preservedLiabilityNotice}</p>}
    </aside>
  )
}
