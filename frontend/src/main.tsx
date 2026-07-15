import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import App from './App.tsx'
import AuthGate from './components/AuthGate.tsx'
import './styles/theme.css'

const domain = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined
const audience = import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined
const root = createRoot(document.getElementById('root')!)

const configurationMissing = !domain || !clientId || !audience
const screenshotDemoMode = new URLSearchParams(window.location.search).get('demo') === '1'

root.render(
  <StrictMode>
    <Auth0Provider
      domain={domain || 'auth0-not-configured.invalid'}
      clientId={clientId || 'auth0-client-not-configured'}
      authorizationParams={{
        redirect_uri: window.location.origin,
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
        <App />
      ) : (
        <AuthGate configurationMissing={configurationMissing}>
          <App />
        </AuthGate>
      )}
    </Auth0Provider>
  </StrictMode>,
)
