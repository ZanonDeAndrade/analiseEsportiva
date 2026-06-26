import type { ReactNode } from 'react'
import styles from './NavButton.module.css'

interface NavButtonProps {
  active: boolean
  /** Show the inset orange bar on the left when active (leagues & periods). */
  bar?: boolean
  onClick: () => void
  children: ReactNode
  right?: ReactNode
}

/** Reusable sidebar row used by leagues, periods and markets. */
export default function NavButton({ active, bar = false, onClick, children, right }: NavButtonProps) {
  const cls = [styles.btn, active && styles.active, bar && styles.bar].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} onClick={onClick}>
      {children}
      {right}
    </button>
  )
}
