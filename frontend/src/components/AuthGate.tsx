import { useAuth0 } from '@auth0/auth0-react'
import { useState, type ReactNode } from 'react'
import { acceptanceTexts } from '../legal/acceptance-texts'
import RiskWarning from './RiskWarning'
import Spinner from './Spinner'
import styles from './AuthGate.module.css'

export default function AuthGate({
  children,
  configurationMissing,
}: {
  children: ReactNode
  configurationMissing: boolean
}) {
  const [accessPrecheck, setAccessPrecheck] = useState(false)
  const {
    error,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    logout,
    user,
  } = useAuth0()

  if (configurationMissing) {
    return import.meta.env.DEV ? <LocalConfiguration /> : <UnavailableIdentity />
  }

  if (isLoading) {
    return (
      <AuthScreen eyebrow="SESSÃO PROTEGIDA" title="Validando sua sessão…">
        <div className={styles.loadingRow}>
          <Spinner size={26} label="Validando sua sessão" />
          <p className={styles.lead}>Estamos confirmando sua identidade e o contexto da organização.</p>
        </div>
      </AuthScreen>
    )
  }

  if (error) {
    return (
      <AuthScreen eyebrow="ACESSO INTERROMPIDO" title="Não foi possível entrar">
        <p className={styles.lead}>A operação foi cancelada, expirou ou foi recusada pelo provedor de identidade.</p>
        <button type="button" className={styles.fullButton} onClick={() => void loginWithRedirect()}>
          Tentar novamente
        </button>
      </AuthScreen>
    )
  }

  if (!isAuthenticated) {
    return (
      <AuthScreen eyebrow="ÁREA DO CLIENTE" title="Entre na sua conta">
        <p className={styles.lead}>Acesse análises probabilísticas com origem, período, amostra e limitações sempre visíveis.</p>
        <RiskWarning variant="compact" />
        <div className={styles.actions}>
          <button type="button" disabled={!accessPrecheck} onClick={() => void loginWithRedirect()}>
            Entrar
          </button>
          <button
            type="button"
            className={styles.secondary}
            disabled={!accessPrecheck}
            onClick={() => {
              sessionStorage.setItem('betintel.pendingAcceptance', 'signup')
              void loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })
            }}
          >
            Criar conta
          </button>
        </div>
        <label className={styles.legalCheck}>
          <input type="checkbox" checked={accessPrecheck} onChange={(event) => setAccessPrecheck(event.target.checked)} />
          <span>{acceptanceTexts.termsAndPrivacy} <a href="/termos-de-uso" target="_blank" rel="noreferrer">Termos</a> · <a href="/politica-de-privacidade" target="_blank" rel="noreferrer">Privacidade</a></span>
        </label>
        <button
          type="button"
          className={styles.link}
          onClick={() => void loginWithRedirect({ authorizationParams: { prompt: 'login' } })}
        >
          Recuperar senha
        </button>
        <small>
          Cadastro, verificação de e-mail, recuperação e MFA acontecem no acesso seguro do Auth0.
          O aceite será confirmado no servidor no primeiro acesso autenticado.
        </small>
      </AuthScreen>
    )
  }

  if (user?.email_verified === false) {
    return (
      <AuthScreen eyebrow="VERIFICAÇÃO DE CONTA" title="Confirme seu e-mail">
        <p className={styles.lead}>Abra a mensagem enviada pelo Auth0 e confirme o endereço antes de continuar.</p>
        <div className={styles.actions}>
          <button
            type="button"
            onClick={() => void loginWithRedirect({ authorizationParams: { prompt: 'login' } })}
          >
            Já confirmei
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => void logout({ logoutParams: { returnTo: window.location.origin } })}
          >
            Sair
          </button>
        </div>
      </AuthScreen>
    )
  }

  return children
}

function LocalConfiguration() {
  return (
    <AuthScreen eyebrow="AMBIENTE LOCAL" title="Conecte o acesso seguro">
      <div className={styles.configStatus} role="status">
        <span aria-hidden="true" />
        Configuração do Auth0 pendente
      </div>
      <p className={styles.lead}>
        A interface está pronta. Para liberar cadastro, login, recuperação e MFA, complete estes três ajustes no ambiente local.
      </p>
      <ol className={styles.setupList}>
        <li>
          <span className={styles.setupNumber}>01</span>
          <div><strong>Edite o arquivo <code>.env</code> da raiz</strong><small>Não crie um <code>package.json</code> dentro de frontend.</small></div>
        </li>
        <li>
          <span className={styles.setupNumber}>02</span>
          <div><strong>Preencha as variáveis públicas</strong><small><code>VITE_AUTH0_DOMAIN</code> · <code>VITE_AUTH0_CLIENT_ID</code> · <code>VITE_AUTH0_AUDIENCE</code></small></div>
        </li>
        <li>
          <span className={styles.setupNumber}>03</span>
          <div><strong>Cadastre a origem no Auth0</strong><small>Callback, logout e web origin: <code>{window.location.origin}</code></small></div>
        </li>
      </ol>
      <div className={styles.actions}>
        <a className={styles.primaryAction} href="/?demo=1">Visualizar demonstração</a>
        <a className={styles.secondaryAction} href="/politica-de-privacidade">Ver privacidade</a>
      </div>
      <p className={styles.helper}>Depois de salvar o <code>.env</code>, reinicie <code>npm run frontend:dev</code>.</p>
    </AuthScreen>
  )
}

function UnavailableIdentity() {
  return (
    <AuthScreen eyebrow="ACESSO INDISPONÍVEL" title="Não foi possível iniciar o acesso">
      <p className={styles.lead}>O provedor de identidade deste ambiente ainda não foi configurado. Nenhum acesso inseguro será liberado como alternativa.</p>
      <a className={styles.secondaryAction} href="/politica-de-privacidade">Consultar política de privacidade</a>
    </AuthScreen>
  )
}

function AuthScreen({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <main className={styles.screen}>
      <section className={styles.frame} aria-label="Acesso ao BetIntel AI">
        <aside className={styles.thesis} aria-label="Princípios da plataforma">
          <div className={styles.brandRow}>
            <div className={styles.brandMark} aria-hidden="true">B</div>
            <div className={styles.brand}>BetIntel <span>AI</span><small>ANÁLISE ESPORTIVA</small></div>
          </div>

          <div className={styles.hero}>
            <p className={styles.kicker}><span aria-hidden="true" /> INTELIGÊNCIA PROBABILÍSTICA</p>
            <h2>Leia o jogo.<span>Veja a evidência.</span></h2>
            <p className={styles.heroCopy}>Análise responsável começa pela origem do dado e termina com a incerteza à vista.</p>
          </div>

          <div className={styles.principles} aria-label="Compromissos da análise">
            <div><span>01</span><strong>Origem</strong><small>identificada</small></div>
            <div><span>02</span><strong>Amostra</strong><small>sempre visível</small></div>
            <div><span>03</span><strong>Incerteza</strong><small>preservada</small></div>
          </div>

          <p className={styles.ethicalNote}><span aria-hidden="true" /> Uso educacional · sem promessa de resultado</p>
        </aside>

        <section className={styles.card} aria-labelledby="auth-title">
          <div className={styles.cardInner}>
            <p className={styles.step}>{eyebrow}</p>
            <h1 id="auth-title">{title}</h1>
            {children}
          </div>
          <footer className={styles.cardFooter}>
            <span>SESSÃO PROTEGIDA</span>
            <span>PRIVACIDADE POR PADRÃO</span>
          </footer>
        </section>
      </section>
    </main>
  )
}
