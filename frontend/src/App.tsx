import { useEffect, useMemo, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import type { LeagueId, Match } from './types'
import { LEAGUES } from './data/leagues'
import { screenshotMatches } from './data/matches'
import { loadBackendMatches } from './lib/api'
import { marketDef } from './lib/markets'
import Header from './components/Header'
import Sidebar, { type LeagueFilter, type PeriodFilter } from './components/Sidebar'
import MatchList from './components/MatchList'
import AnalysisPanel from './components/AnalysisPanel'
import AccountPanel from './components/AccountPanel'
import styles from './App.module.css'

const SHOW_FORM = true
const SCREENSHOT_DEMO_MODE = new URLSearchParams(window.location.search).get('demo') === '1'

export default function App() {
  const { getAccessTokenSilently, logout, user } = useAuth0()
  const [league, setLeague] = useState<LeagueFilter>('todas')
  const [period, setPeriod] = useState<PeriodFilter>('todos')
  const [market, setMarket] = useState('1X2')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [aiOn, setAiOn] = useState(true)
  const [matches, setMatches] = useState<Match[]>(
    SCREENSHOT_DEMO_MODE ? screenshotMatches : [],
  )
  const [backendError, setBackendError] = useState<string | null>(null)
  const [usingFallback, setUsingFallback] = useState(false)

  // Mobile / tablet drawer state
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(
    new URLSearchParams(window.location.search).get('account') === '1',
  )

  // Period + query filter (shared base; league counts derive from this).
  const base = useMemo(() => {
    const q = query.trim().toLowerCase()
    return matches.filter((m) => {
      if (period !== 'todos' && m.period !== period) return false
      if (q) {
        const haystack = `${m.homeTeam} ${m.awayTeam} ${m.league}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [matches, period, query])

  const list = useMemo(
    () => base.filter((m) => league === 'todas' || m.leagueId === league),
    [base, league],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { todas: base.length }
    for (const l of LEAGUES) c[l.id] = base.filter((m) => m.leagueId === (l.id as LeagueId)).length
    return c
  }, [base])

  const def = useMemo(() => marketDef(market), [market])

  // Selected fixture always resolves to something visible-ish; falls back to first.
  const selectedMatch = matches.find((m) => m.id === selected) ?? matches[0]

  useEffect(() => {
    if (SCREENSHOT_DEMO_MODE) {
      setSelected(screenshotMatches[0]?.id ?? '')
      setUsingFallback(true)
      return
    }

    let cancelled = false
    const refreshMatches = () => {
      loadBackendMatches(getAccessTokenSilently, false)
        .then((loaded) => {
          if (cancelled) return

          const active = removeExpiredMatches(loaded)
          const current = active.filter((match) => !match.isFallback)
          const hiddenFallbacks = active.length - current.length
          setMatches(current)
          setUsingFallback(hiddenFallbacks > 0)
          setBackendError(
            hiddenFallbacks > 0
              ? `${hiddenFallbacks} jogo(s) simulado(s) ocultado(s). Configure a API ou ajuste a janela para exibir apenas jogos reais.`
              : null,
          )
          setSelected((selectedId) =>
            current.some((match) => match.id === selectedId) ? selectedId : (current[0]?.id ?? ''),
          )
        })
        .catch((error) => {
          if (cancelled) return
          const message = error instanceof Error ? error.message : 'Backend indisponivel'
          setBackendError(message)
          setUsingFallback(false)
        })
    }

    refreshMatches()
    const refreshTimer = window.setInterval(refreshMatches, 30_000)
    const expiryTimer = window.setInterval(() => {
      setMatches((current) => {
        const active = removeExpiredMatches(current)

        if (active.length !== current.length) {
          setSelected((selectedId) =>
            active.some((match) => match.id === selectedId) ? selectedId : (active[0]?.id ?? ''),
          )
        }

        return active
      })
    }, 5_000)

    return () => {
      cancelled = true
      window.clearInterval(refreshTimer)
      window.clearInterval(expiryTimer)
    }
  }, [getAccessTokenSilently])

  useEffect(() => {
    if (!selectedMatch && matches.length > 0) {
      setSelected(matches[0].id)
    }
  }, [matches, selectedMatch])

  useEffect(() => {
    if (matches.length === 0) {
      setAnalysisOpen(false)
    }
  }, [matches.length])

  /*
    The backend is the source of truth for current fixtures. This client-side
    pruning makes kickoff removal immediate between backend polling intervals.
  */
  function removeExpiredMatches(items: typeof matches) {
    const now = Date.now()

    return items.filter((match) => {
      if (!match.isoDate) return true
      const kickoff = new Date(match.isoDate).getTime()
      return Number.isNaN(kickoff) || kickoff > now
    })
  }

  const handleView = (id: string) => {
    setSelected(id)
    setAnalysisOpen(true) // opens the drawer on tablet/mobile; no-op on desktop
  }

  const closeDrawers = () => {
    setSidebarOpen(false)
    setAnalysisOpen(false)
  }

  return (
    <div className={styles.app}>
      <Header
        query={query}
        onSearch={setQuery}
        aiOn={aiOn}
        onToggleAI={() => setAiOn((v) => !v)}
        onOpenMenu={() => setSidebarOpen(true)}
        dataStatus={
          SCREENSHOT_DEMO_MODE
            ? 'demo'
            : backendError?.startsWith('Backend indisponivel') && matches.length === 0
            ? 'offline'
            : backendError || usingFallback
              ? 'warning'
              : 'real'
        }
        userName={user?.name ?? user?.email}
        onOpenAccount={() => setAccountOpen(true)}
        onLogout={() => void logout({ logoutParams: { returnTo: window.location.origin } })}
      />

      <div id="shell" className={styles.shell}>
        <Sidebar
          league={league}
          period={period}
          market={market}
          counts={counts}
          onLeague={setLeague}
          onPeriod={setPeriod}
          onMarket={setMarket}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <MatchList
          matches={list}
          def={def}
          marketLabel={market}
          selectedId={selectedMatch?.id ?? ''}
          showForm={SHOW_FORM}
          usingFallback={usingFallback}
          demoMode={SCREENSHOT_DEMO_MODE}
          backendError={backendError}
          onView={handleView}
        />

        {selectedMatch && (
          <AnalysisPanel
            match={selectedMatch}
            aiOn={aiOn}
            open={analysisOpen}
            onClose={() => setAnalysisOpen(false)}
          />
        )}
      </div>

      {/* Backdrop for the mobile/tablet drawers */}
      <div
        className={`${styles.backdrop} ${sidebarOpen || analysisOpen ? styles.backdropShow : ''}`}
        onClick={closeDrawers}
      />

      <AccountPanel open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  )
}
