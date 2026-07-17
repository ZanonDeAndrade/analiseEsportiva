import Spinner from './Spinner'
import styles from './AsyncState.module.css'

export default function AsyncState({
  kind,
  title,
  detail,
  action,
}: {
  kind: 'loading' | 'empty' | 'error' | 'success'
  title: string
  detail?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className={`${styles.state} ${styles[kind]}`} role={kind === 'error' ? 'alert' : 'status'} aria-live="polite">
      {kind === 'loading'
        ? <Spinner size={24} label={title} />
        : <span className={styles.marker} aria-hidden="true" />}
      <div><strong>{title}</strong>{detail && <p>{detail}</p>}</div>
      {action && <button type="button" onClick={action.onClick}>{action.label}</button>}
    </div>
  )
}
