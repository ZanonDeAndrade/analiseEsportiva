import { useAuth0 } from '@auth0/auth0-react'
import type { ReactNode } from 'react'
import styles from './AuthGate.module.css'

export default function AuthGate({
  children,
  configurationMissing,
}: {
  children: ReactNode
  configurationMissing: boolean
}) {
  const {
    error,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    logout,
    user,
  } = useAuth0()

  if (configurationMissing) {
    return (
      <AuthScreen title="Identidade não configurada">
        <p>Defina VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID e VITE_AUTH0_AUDIENCE.</p>
      </AuthScreen>
    )
  }

  if (isLoading) return <AuthScreen title="Validando sessão…" />

  if (error) {
    return (
      <AuthScreen title="Não foi possível concluir a autenticação">
        <p>A operação foi cancelada, expirou ou foi recusada pelo provedor.</p>
        <button type="button" onClick={() => void loginWithRedirect()}>
          Tentar novamente
        </button>
      </AuthScreen>
    )
  }

  if (!isAuthenticated) {
    return (
      <AuthScreen title="BetIntel AI">
        <p>Análises probabilísticas acadêmicas. Resultados históricos não garantem resultados futuros.</p>
        <div className={styles.actions}>
          <button type="button" onClick={() => void loginWithRedirect()}>
            Entrar
          </button>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => void loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })}
          >
            Criar conta
          </button>
        </div>
        <button
          type="button"
          className={styles.link}
          onClick={() => void loginWithRedirect({ authorizationParams: { prompt: 'login' } })}
        >
          Recuperar senha no Auth0
        </button>
        <small>
          Cadastro, verificação de e-mail, recuperação, TOTP e códigos de recuperação acontecem no Universal Login.
        </small>
      </AuthScreen>
    )
  }

  if (user?.email_verified === false) {
    return (
      <AuthScreen title="Confirme seu e-mail">
        <p>Abra a mensagem enviada pelo Auth0 e confirme o endereço antes de continuar.</p>
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
      </AuthScreen>
    )
  }

  return children
}

function AuthScreen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <main className={styles.screen}>
      <section className={styles.card}>
        <div className={styles.brand}>BetIntel <span>AI</span></div>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  )
}
