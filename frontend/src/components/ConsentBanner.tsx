import { useState } from 'react'
import styles from './ConsentBanner.module.css'

type Consent = 'essential' | 'analytics'
const STORAGE_KEY = 'betintel.consent.v1'

export default function ConsentBanner() {
  const [consent, setConsent] = useState<Consent | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'essential' || stored === 'analytics' ? stored : null
  })
  if (consent) return null

  const choose = (value: Consent) => {
    localStorage.setItem(STORAGE_KEY, value)
    window.dispatchEvent(new CustomEvent('betintel:consent', { detail: { analytics: value === 'analytics' } }))
    setConsent(value)
  }

  return <section className={styles.banner} aria-label="Preferências de privacidade" aria-live="polite">
    <div><strong>Privacidade sob seu controle</strong><p>Usamos armazenamento essencial para manter suas preferências. Analytics opcionais só podem iniciar depois do seu consentimento; nenhum provedor de analytics está configurado neste ambiente por padrão. <a href="/politica-de-privacidade">Ler política</a>.</p></div>
    <div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => choose('essential')}>Somente essenciais</button><button type="button" onClick={() => choose('analytics')}>Permitir analytics</button></div>
  </section>
}
