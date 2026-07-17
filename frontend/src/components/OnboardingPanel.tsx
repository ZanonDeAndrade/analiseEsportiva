import { useState } from 'react'
import { userTimeZone } from '../lib/intl'
import type { MeResponse, OrganizationSummary } from '../lib/saasApi'
import styles from './OnboardingPanel.module.css'

export function onboardingCompleted(userId: string | undefined) {
  return Boolean(userId && localStorage.getItem(`betintel.onboarding.${userId}`) === 'complete')
}

export default function OnboardingPanel({
  me,
  organizations,
  emailVerified,
  onComplete,
}: {
  me: MeResponse
  organizations: OrganizationSummary[]
  emailVerified: boolean
  onComplete: () => void
}) {
  const [understood, setUnderstood] = useState(false)
  const active = organizations.find((organization) => organization.id === me.organizationId)
  const complete = () => {
    localStorage.setItem(`betintel.onboarding.${me.userId}`, 'complete')
    onComplete()
  }
  return <div className={styles.backdrop}>
    <section className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <p className={styles.eyebrow}>PRIMEIRO ACESSO / 4 MARCADORES</p>
      <h1 id="onboarding-title">Prepare sua sala de analise</h1>
      <p className={styles.lead}>Cada marcador abaixo corresponde a um estado real da conta ou a uma escolha sua.</p>
      <ol className={styles.steps}>
        <li data-complete={emailVerified}><span>01</span><div><strong>E-mail verificado</strong><p>{emailVerified ? 'Confirmado pelo provedor de identidade.' : 'Confirme o e-mail no Universal Login antes de continuar.'}</p></div></li>
        <li data-complete={Boolean(active)}><span>02</span><div><strong>Espaco pessoal</strong><p>{active ? 'Ambiente de dados provisionado para sua conta.' : 'O ambiente de dados da conta ainda nao foi provisionado.'}</p></div></li>
        <li data-complete><span>03</span><div><strong>Fuso de apresentacao</strong><p>{userTimeZone}. Dados persistidos permanecem em UTC.</p></div></li>
        <li data-complete={understood}><span>04</span><label><strong>Leitura responsavel</strong><p>Entendo que probabilidades sao estimativas educacionais, nao certezas ou recomendacoes.</p><input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} /> Confirmar entendimento</label></li>
      </ol>
      <div className={styles.actions}><button type="button" disabled={!emailVerified || !active || !understood} onClick={complete}>Abrir dashboard</button></div>
    </section>
  </div>
}
