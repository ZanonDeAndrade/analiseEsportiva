import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Context, Auth0Provider, type Auth0ContextInterface } from '@auth0/auth0-react'
import App from './App.tsx'
import AuthGate from './components/AuthGate.tsx'
import LegalAcceptanceGate, { DemoAccessGate } from './components/LegalAcceptanceGate.tsx'
import PublicLegalRouter, { isPublicLegalPath } from './legal/PublicLegalRouter.tsx'
import './styles/theme.css'
import ConsentBanner from './components/ConsentBanner.tsx'
import OperationalUnavailable, { operationalUnavailableEnabled } from './components/OperationalUnavailable.tsx'

const domain = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined
const audience = import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined
const redirectUri = (import.meta.env.VITE_AUTH0_REDIRECT_URI as string | undefined)?.trim() || window.location.origin
const root = createRoot(document.getElementById('root')!)

const configurationMissing = !domain || !clientId || !audience
const screenshotDemoMode = new URLSearchParams(window.location.search).get('demo') === '1'
const e2eMode = import.meta.env.DEV
  && import.meta.env.VITE_E2E_MODE === 'true'
  && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')

const e2eAuth = {
  isAuthenticated: true,
  isLoading: false,
  user: { sub: 'auth0|e2e-user', name: 'Analista E2E', email: 'e2e@example.test', email_verified: true },
  getAccessTokenSilently: async () => 'e2e-test-token',
  loginWithRedirect: async () => undefined,
  logout: async () => undefined,
  getAccessTokenWithPopup: async () => 'e2e-test-token',
  getIdTokenClaims: async () => undefined,
  loginWithPopup: async () => undefined,
  handleRedirectCallback: async () => ({ appState: undefined }),
} as unknown as Auth0ContextInterface

if (isPublicLegalPath(window.location.pathname)) {
  root.render(<StrictMode><PublicLegalRouter /><ConsentBanner /></StrictMode>)
} else if (operationalUnavailableEnabled()) {
  root.render(<StrictMode><OperationalUnavailable /><ConsentBanner /></StrictMode>)
} else if (e2eMode) {
  root.render(<StrictMode><Auth0Context.Provider value={e2eAuth}><App /><ConsentBanner /></Auth0Context.Provider></StrictMode>)
} else {
  root.render(
    <StrictMode>
      <Auth0Provider
      domain={domain || 'auth0-not-configured.invalid'}
      clientId={clientId || 'auth0-client-not-configured'}
      authorizationParams={{
        redirect_uri: redirectUri,
        audience: audience || 'https://auth0-not-configured.invalid/api',
        scope: 'openid profile email offline_access',
      }}
      useRefreshTokens
      useRefreshTokensFallback={false}
      cacheLocation="memory"
      onRedirectCallback={(appState) => {
        const returnTo = appState?.returnTo
        window.history.replaceState({}, document.title, returnTo || window.location.pathname)
      }}
    >
      {screenshotDemoMode ? (
        <DemoAccessGate><App /></DemoAccessGate>
      ) : (
        <AuthGate configurationMissing={configurationMissing}>
          <LegalAcceptanceGate><App /></LegalAcceptanceGate>
        </AuthGate>
      )}
      <ConsentBanner />
      </Auth0Provider>
    </StrictMode>,
  )
}
