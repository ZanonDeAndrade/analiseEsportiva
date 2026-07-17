import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import type { Match } from './types'
import { LEAGUES } from './data/leagues'
import { screenshotMatches } from './data/matches'
import { loadBackendMatches } from './lib/api'
import {
  loadWorkspaceBootstrap,
  switchOrganization,
  type MeResponse,
  type OrganizationSummary,
} from './lib/saasApi'
import { marketDef } from './lib/markets'
import Header from './components/Header'
import Sidebar, { type LeagueFilter, type PeriodFilter, type WorkspaceView } from './components/Sidebar'
import MatchList from './components/MatchList'
import AnalysisPanel from './components/AnalysisPanel'
import LegalFooter from './components/LegalFooter'
import DataOperationsPanel from './components/DataOperationsPanel'
import OnboardingPanel, { onboardingCompleted } from './components/OnboardingPanel'
import AsyncState from './components/AsyncState'
import styles from './App.module.css'

const AccountPanel = lazy(() => import('./components/AccountPanel'))
const BillingPage = lazy(() => import('./components/BillingPage'))
const SupportPage = lazy(() => import('./components/SupportPage'))
const AdminOperationsPage = lazy(() => import('./components/AdminOperationsPage'))

const SHOW_FORM = true
const SCREENSHOT_DEMO_MODE = import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === '1'
const WORKSPACE_VIEWS = new Set<WorkspaceView>(['dashboard', 'billing', 'account', 'support', 'admin'])

export default function App() {
  const { getAccessTokenSilently, loginWithRedirect, logout, user } = useAuth0()
  const [league, setLeague] = useState<LeagueFilter>('todas')
  const [period, setPeriod] = useState<PeriodFilter>('todos')
  const [market, setMarket] = useState('1X2')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [aiOn, setAiOn] = useState(true)
  const [activeView, setActiveView] = useState<WorkspaceView>(() => viewFromUrl())
  const [matches, setMatches] = useState<Match[]>(SCREENSHOT_DEMO_MODE ? screenshotMatches : [])
  const [backendError, setBackendError] = useState<string | null>(null)
  const [usingFallback, setUsingFallback] = useState(SCREENSHOT_DEMO_MODE)
  const [refreshing, setRefreshing] = useState(false)
  const [workspaceLoading, setWorkspaceLoading] = useState(true)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([])
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const lastRefreshAt = useRef(0)
  const activeRequest = useRef<AbortController | null>(null)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [dataOperationsOpen, setDataOperationsOpen] = useState(false)

  const reloadWorkspace = useCallback(async (signal?: AbortSignal) => {
    setWorkspaceLoading(true); setWorkspaceError(null)
    try {
      const result = await loadWorkspaceBootstrap(getAccessTokenSilently, signal)
      setMe(result.me); setOrganizations(result.organizations)
      setShowOnboarding(!onboardingCompleted(result.me.userId))
    } catch (value) {
      if (!(value instanceof DOMException && value.name === 'AbortError')) setWorkspaceError(message(value))
    } finally { if (!signal?.aborted) setWorkspaceLoading(false) }
  }, [getAccessTokenSilently])

  useEffect(() => {
    const controller = new AbortController()
    void reloadWorkspace(controller.signal)
    return () => controller.abort()
  }, [reloadWorkspace])

  useEffect(() => {
    const expired = () => setSessionExpired(true)
    window.addEventListener('betintel:session-expired', expired)
    return () => window.removeEventListener('betintel:session-expired', expired)
  }, [])

  const refreshMatches = useCallback(async (forceRefresh = false) => {
    if (SCREENSHOT_DEMO_MODE) return
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    setRefreshing(true); setBackendError(null)
    try {
      const loaded = await loadBackendMatches(getAccessTokenSilently, { forceRefresh, signal: controller.signal })
      const active = removeExpiredMatches(loaded.matches)
      const real = active.filter((match) => !match.isFallback)
      const hidden = active.length - real.length
      const predictionFailures = real.filter((match) => match.backendError).length
      setMatches(real)
      setUsingFallback(hidden > 0)
      setBackendError(hidden > 0
        ? `${hidden} fixture(s) simulada(s) foram ocultadas.`
        : predictionFailures > 0
          ? `${predictionFailures} partida(s) carregadas sem predicao; consulte o detalhe do erro.`
          : loaded.warnings[0]
            ?? (real.length === 0
              ? `Nenhum jogo atual foi retornado por ${loaded.sourceProvider}. A última sincronização registrada não contém fixtures futuras válidas.`
              : null))
      setSelected((current) => real.some((match) => match.id === current) ? current : real[0]?.id ?? '')
      lastRefreshAt.current = Date.now()
    } catch (value) {
      if (!(value instanceof DOMException && value.name === 'AbortError')) setBackendError(message(value))
    } finally {
      if (!controller.signal.aborted) setRefreshing(false)
      if (activeRequest.current === controller) activeRequest.current = null
    }
  }, [getAccessTokenSilently])

  useEffect(() => {
    if (activeView !== 'dashboard') return
    void refreshMatches(false)
    const refreshWhenUseful = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefreshAt.current >= 5 * 60_000) void refreshMatches(false)
    }
    window.addEventListener('online', refreshWhenUseful)
    document.addEventListener('visibilitychange', refreshWhenUseful)
    return () => {
      activeRequest.current?.abort()
      window.removeEventListener('online', refreshWhenUseful)
      document.removeEventListener('visibilitychange', refreshWhenUseful)
    }
  }, [activeView, refreshMatches])

  useEffect(() => {
    const nextKickoff = matches.map((match) => Date.parse(match.isoDate ?? '')).filter((time) => Number.isFinite(time) && time > Date.now()).sort((a, b) => a - b)[0]
    if (!nextKickoff) return
    const timer = window.setTimeout(() => {
      setMatches((current) => removeExpiredMatches(current))
      setSelected((current) => matches.some((match) => match.id === current && Date.parse(match.isoDate ?? '') > Date.now()) ? current : '')
    }, Math.min(nextKickoff - Date.now() + 500, 2_147_000_000))
    return () => window.clearTimeout(timer)
  }, [matches])

  const base = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return matches.filter((match) => {
      if (period !== 'todos' && match.period !== period) return false
      return !normalized || `${match.homeTeam} ${match.awayTeam} ${match.league}`.toLowerCase().includes(normalized)
    })
  }, [matches, period, query])
  const list = useMemo(() => base.filter((match) => league === 'todas' || match.leagueId === league), [base, league])
  const counts = useMemo(() => {
    const result: Record<string, number> = { todas: base.length }
    for (const item of LEAGUES) result[item.id] = base.filter((match) => match.leagueId === item.id).length
    return result
  }, [base])
  const selectedMatch = matches.find((match) => match.id === selected) ?? matches[0]
  const def = useMemo(() => marketDef(market), [market])

  const navigate = (view: WorkspaceView) => {
    setActiveView(view); setSidebarOpen(false); setAnalysisOpen(false)
    const url = new URL(window.location.href)
    url.searchParams.set('view', view)
    window.history.replaceState({}, '', url)
    window.setTimeout(() => document.getElementById('workspace-main')?.focus(), 0)
  }

  const handleSwitchOrganization = async (organizationId: string) => {
    if (!organizationId || organizationId === me?.organizationId) return
    setRefreshing(true); setWorkspaceError(null)
    try {
      await switchOrganization(getAccessTokenSilently, organizationId)
      await reloadWorkspace()
      if (activeView === 'dashboard') await refreshMatches(true)
    } catch (value) { setWorkspaceError(message(value)) } finally { setRefreshing(false) }
  }

  const canManageData = me?.platformAdmin === true
  const dataStatus = SCREENSHOT_DEMO_MODE ? 'demo' : backendError && matches.length === 0 ? 'offline' : backendError || usingFallback ? 'warning' : 'real'

  return <div className={styles.app}>
    <nav aria-label="Atalhos de teclado"><a className={styles.skipLink} href={activeView === 'dashboard' ? '#matchlist' : '#workspace-main'}>Pular para o conteudo</a></nav>
    <Header
      query={query} onSearch={setQuery} aiOn={aiOn} onToggleAI={() => setAiOn((value) => !value)} onOpenMenu={() => setSidebarOpen(true)} menuOpen={sidebarOpen}
      dataStatus={dataStatus} userName={user?.name ?? user?.email} onOpenAccount={() => navigate('account')}
      onLogout={() => void logout({ logoutParams: { returnTo: window.location.origin } })}
      onOpenDataOperations={canManageData ? () => setDataOperationsOpen(true) : undefined}
      organizations={organizations} activeOrganizationId={me?.organizationId} onSwitchOrganization={(id) => void handleSwitchOrganization(id)}
      onRefresh={() => void (activeView === 'dashboard' ? refreshMatches(true) : reloadWorkspace())} refreshing={refreshing}
    />

    <div
      id="shell"
      className={`${styles.shell} ${activeView === 'dashboard' && !selectedMatch ? styles.shellWithoutAnalysis : ''}`}
    >
      <Sidebar league={league} period={period} market={market} counts={counts} onLeague={setLeague} onPeriod={setPeriod} onMarket={setMarket}
        activeView={activeView} onNavigate={navigate} organizations={organizations} activeOrganizationId={me?.organizationId}
        onSwitchOrganization={(id) => void handleSwitchOrganization(id)} platformAdmin={me?.platformAdmin === true} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {sessionExpired ? <main className={styles.statePage} id="workspace-main"><AsyncState kind="error" title="Sessao expirada" detail="O servidor recusou a credencial. Entre novamente; nenhum dado em cache sera apresentado como atual." action={{ label: 'Entrar novamente', onClick: () => void loginWithRedirect({ authorizationParams: { prompt: 'login' } }) }} /></main>
      : workspaceLoading ? <main className={styles.statePage} id="workspace-main"><AsyncState kind="loading" title="Abrindo workspace" detail="Validando conta e organizacao no servidor." /></main>
      : workspaceError ? <main className={styles.statePage} id="workspace-main"><AsyncState kind="error" title="Workspace indisponivel" detail={workspaceError} action={{ label: 'Tentar novamente', onClick: () => void reloadWorkspace() }} /></main>
      : activeView === 'dashboard' ? <>
        <MatchList matches={list} def={def} marketLabel={market} selectedId={selectedMatch?.id ?? ''} showForm={SHOW_FORM} usingFallback={usingFallback} demoMode={SCREENSHOT_DEMO_MODE} backendError={backendError} loading={refreshing && matches.length === 0} onRetry={() => void refreshMatches(true)} onView={(id) => { setSelected(id); setAnalysisOpen(true) }} />
        {selectedMatch && <AnalysisPanel match={selectedMatch} aiOn={aiOn} open={analysisOpen} onClose={() => setAnalysisOpen(false)} />}
      </>
      : <Suspense fallback={<main className={styles.statePage} id="workspace-main"><AsyncState kind="loading" title="Abrindo area" /></main>}>
        {activeView === 'billing' ? <BillingPage />
        : activeView === 'account' ? <AccountPanel open mode="page" onClose={() => navigate('dashboard')} />
        : activeView === 'admin' && me?.platformAdmin ? <AdminOperationsPage />
        : <SupportPage />}
      </Suspense>}
    </div>

    <div className={`${styles.backdrop} ${sidebarOpen || analysisOpen ? styles.backdropShow : ''}`} onClick={() => { setSidebarOpen(false); setAnalysisOpen(false) }} />
    <DataOperationsPanel open={dataOperationsOpen} onClose={() => setDataOperationsOpen(false)} />
    {showOnboarding && me && <OnboardingPanel me={me} organizations={organizations} emailVerified={user?.email_verified !== false} onComplete={() => setShowOnboarding(false)} />}
    <LegalFooter />
  </div>
}

function removeExpiredMatches(items: Match[]) {
  const now = Date.now()
  return items.filter((match) => { const kickoff = Date.parse(match.isoDate ?? ''); return !Number.isFinite(kickoff) || kickoff > now })
}
function message(value: unknown) { return value instanceof Error ? value.message : 'Operacao nao concluida.' }
function viewFromUrl(): WorkspaceView { const value = new URLSearchParams(window.location.search).get('view') as WorkspaceView | null; return value && WORKSPACE_VIEWS.has(value) ? value : 'dashboard' }
