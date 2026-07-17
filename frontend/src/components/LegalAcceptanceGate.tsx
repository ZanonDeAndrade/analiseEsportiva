import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { acceptanceTexts } from '../legal/acceptance-texts'
import { legalConfig, legalDraftWarning } from '../legal/legal-config'
import { loadLegalStatus, recordLegalAcceptance, type LegalAcceptanceStatus } from '../lib/api'
import RiskWarning from './RiskWarning'
import styles from './LegalAcceptanceGate.module.css'

export default function LegalAcceptanceGate({ children }: { children: ReactNode }) {
  const { getAccessTokenSilently, logout } = useAuth0()
  const [status, setStatus] = useState<LegalAcceptanceStatus | null>(null)
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [riskAccepted, setRiskAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState(false)
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])

  useEffect(() => {
    let cancelled = false
    loadLegalStatus(getAccessTokenSilently)
      .then((result) => { if (!cancelled) setStatus(result) })
      .catch((caught) => { if (!cancelled) setError(errorMessage(caught)) })
    return () => { cancelled = true }
  }, [getAccessTokenSilently])

  if (completed || status?.requiresAcceptance === false) return children

  const versionProblem = status ? validateBundledVersions(status) : null
  const purpose = status?.acceptedAt
    ? 'material_update'
    : sessionStorage.getItem('betintel.pendingAcceptance') === 'signup'
      ? 'signup'
      : 'first_access'

  const submit = async () => {
    if (!status || !ageConfirmed || !termsAccepted || !riskAccepted || versionProblem) return
    setBusy(true)
    setError(null)
    try {
      const result = await recordLegalAcceptance(getAccessTokenSilently, status, {
        purpose,
        idempotencyKey,
      })
      if (result.acceptances.length !== status.requiredDocuments.length || !result.acceptedAt) {
        throw new Error('O servidor não confirmou toda a evidência do aceite.')
      }
      const refreshed = await loadLegalStatus(getAccessTokenSilently)
      if (refreshed.requiresAcceptance) {
        throw new Error('O aceite foi parcialmente persistido. O acesso permanece bloqueado.')
      }
      sessionStorage.removeItem('betintel.pendingAcceptance')
      setCompleted(true)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={styles.screen}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="legal-gate-title">
        <div className={styles.brand}>BetIntel <span>AI</span></div>
        {!status && !error && <><h1 id="legal-gate-title">Carregando documentos jurídicos…</h1><p>O acesso às análises permanece bloqueado até a validação no servidor.</p></>}
        {error && !status && <>
          <h1 id="legal-gate-title">Não foi possível validar o aceite</h1>
          <p className={styles.error}>{error}</p>
          <button type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
        </>}
        {status && !ageConfirmed && <>
          <div className={styles.draft}>{legalDraftWarning}</div>
          <h1 id="legal-gate-title">Confirmação de maioridade</h1>
          <p>{acceptanceTexts.age}</p>
          <RiskWarning variant="modal" />
          <div className={styles.actions}>
            <button type="button" onClick={() => setAgeConfirmed(true)}>Tenho 18 anos ou mais</button>
            <button type="button" className={styles.secondary} onClick={() => void logout({ logoutParams: { returnTo: window.location.origin } })}>Sair da plataforma</button>
          </div>
          <small>Esta é uma declaração de maioridade, não uma verificação absoluta de idade.</small>
        </>}
        {status && ageConfirmed && <>
          <div className={styles.draft}>{legalDraftWarning}</div>
          <h1 id="legal-gate-title">Leitura e aceite necessários</h1>
          {purpose === 'material_update' && <div className={styles.changes}>
            <strong>Alteração material — novo aceite necessário</strong>
            {status.requiredDocuments.filter((document) => status.missingDocumentTypes.includes(document.type)).map((document) => <p key={document.id}>{document.title} v{document.version}: {document.changeSummary}</p>)}
          </div>}
          {versionProblem && <p className={styles.error}>{versionProblem}</p>}
          <label className={styles.check}>
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
            <span>{acceptanceTexts.termsAndPrivacy} <a href="/termos-de-uso" target="_blank" rel="noreferrer">Termos de Uso</a> · <a href="/politica-de-privacidade" target="_blank" rel="noreferrer">Política de Privacidade</a></span>
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={riskAccepted} onChange={(event) => setRiskAccepted(event.target.checked)} />
            <span>{acceptanceTexts.risk}</span>
          </label>
          <RiskWarning variant="checkbox" showLiability />
          {error && <p className={styles.error}>{error}</p>}
          <button type="button" disabled={busy || !termsAccepted || !riskAccepted || Boolean(versionProblem)} onClick={() => void submit()}>
            {busy ? 'Registrando aceite…' : 'Aceitar documentos e acessar análises'}
          </button>
          <small>Os checkboxes não são pré-marcados. O horário é gerado no servidor; se o registro falhar, o acesso continuará bloqueado.</small>
        </>}
      </section>
    </main>
  )
}

export function DemoAccessGate({ children }: { children: ReactNode }) {
  const [age, setAge] = useState(false)
  const [risk, setRisk] = useState(false)
  const [open, setOpen] = useState(sessionStorage.getItem('betintel.demoRiskAcknowledged') !== '1')
  if (!open) return children
  return (
    <main className={styles.screen}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="demo-gate-title">
        <h1 id="demo-gate-title">Demonstração — confirmação necessária</h1>
        <RiskWarning variant="modal" />
        <label className={styles.check}><input type="checkbox" checked={age} onChange={(event) => setAge(event.target.checked)} /><span>Declaro ter 18 anos ou mais.</span></label>
        <label className={styles.check}><input type="checkbox" checked={risk} onChange={(event) => setRisk(event.target.checked)} /><span>Li e compreendi o aviso de risco.</span></label>
        <button type="button" disabled={!age || !risk} onClick={() => { sessionStorage.setItem('betintel.demoRiskAcknowledged', '1'); setOpen(false) }}>Acessar demonstração</button>
        <small>Este registro vale apenas para a sessão de demonstração e não constitui aceite contratual persistido.</small>
      </section>
    </main>
  )
}

function validateBundledVersions(status: LegalAcceptanceStatus) {
  const expected = {
    terms: { version: legalConfig.terms.version, hash: legalConfig.terms.hash },
    privacy: { version: legalConfig.privacy.version, hash: legalConfig.privacy.hash },
    risk: { version: legalConfig.risk.version, hash: legalConfig.risk.hash },
  }
  for (const document of status.requiredDocuments) {
    const local = expected[document.type as keyof typeof expected]
    if (local && (local.version !== document.version || local.hash !== document.contentHash)) {
      return `A versão ${document.version} de ${document.title} ainda não está disponível neste frontend. Recarregue após a publicação coordenada.`
    }
  }
  return null
}

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : 'Não foi possível concluir o aceite.'
}
