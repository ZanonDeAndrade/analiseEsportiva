import type { CSSProperties } from 'react'
import type { LeagueId, Period } from '../types'
import { LEAGUES } from '../data/leagues'
import { MARKETS } from '../lib/markets'
import { dotColor } from '../lib/theme'
import NavButton from './NavButton'
import { CalendarIcon, ChartIcon, CloseIcon, ListIcon } from './Icons'
import styles from './Sidebar.module.css'

export type LeagueFilter = LeagueId | 'todas'
export type PeriodFilter = Period | 'todos'

interface SidebarProps {
  league: LeagueFilter
  period: PeriodFilter
  market: string
  counts: Record<string, number>
  onLeague: (id: LeagueFilter) => void
  onPeriod: (id: PeriodFilter) => void
  onMarket: (name: string) => void
  /** Mobile drawer state. */
  open: boolean
  onClose: () => void
}

const PERIODS: { id: PeriodFilter; name: string }[] = [
  { id: 'todos', name: 'Todos os jogos' },
  { id: 'hoje', name: 'Hoje' },
  { id: 'amanha', name: 'Amanhã' },
  { id: '7dias', name: 'Calendário futuro' },
]

const LEAGUE_OPTIONS: { id: LeagueFilter; name: string; dot: LeagueId | null }[] = [
  { id: 'todas', name: 'Todas as ligas', dot: null },
  ...LEAGUES.map((l) => ({ id: l.id as LeagueFilter, name: l.name, dot: l.id })),
]

export default function Sidebar({
  league,
  period,
  market,
  counts,
  onLeague,
  onPeriod,
  onMarket,
  open,
  onClose,
}: SidebarProps) {
  return (
    <aside id="sidebar" className={`${styles.sidebar} ${open ? styles.open : ''}`}>
      <div className={styles.mobileHeader}>
        <span>Filtros</span>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar filtros">
          <CloseIcon size={18} />
        </button>
      </div>

      {/* Ligas */}
      <div className={styles.sectionLabel}>
        <ListIcon /> Ligas
      </div>
      <div className={styles.group}>
        {LEAGUE_OPTIONS.map((lg) => {
          const active = league === lg.id
          const dotStyle: CSSProperties = {
            width: 8,
            height: 8,
            borderRadius: 2,
            flexShrink: 0,
            background: lg.dot ? dotColor(lg.dot) : 'transparent',
            border: lg.dot ? 'none' : '1px solid rgba(255,255,255,.22)',
          }
          const countStyle: CSSProperties = {
            fontSize: 10.5,
            fontWeight: 700,
            color: active ? 'var(--accent-2)' : 'var(--muted-3)',
            background: active ? 'rgba(255,106,26,.12)' : 'rgba(255,255,255,.05)',
            borderRadius: 5,
            padding: '1px 6px',
            minWidth: 20,
            textAlign: 'center',
          }
          return (
            <NavButton
              key={lg.id}
              active={active}
              bar
              onClick={() => onLeague(lg.id)}
              right={<span style={countStyle}>{counts[lg.id] ?? 0}</span>}
            >
              <span style={dotStyle} />
              <span className={styles.ellipsis}>{lg.name}</span>
            </NavButton>
          )
        })}
      </div>

      {/* Período */}
      <div className={styles.sectionLabel}>
        <CalendarIcon /> Período
      </div>
      <div className={styles.group}>
        {PERIODS.map((p) => (
          <NavButton key={p.id} active={period === p.id} bar onClick={() => onPeriod(p.id)}>
            <span className={styles.flexLabel}>{p.name}</span>
          </NavButton>
        ))}
      </div>

      {/* Mercados */}
      <div className={styles.sectionLabel}>
        <ChartIcon /> Mercados
      </div>
      <div className={styles.group}>
        {MARKETS.map((mk) => {
          const active = market === mk.name
          const tagStyle: CSSProperties = {
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            color: active ? 'var(--accent-2)' : 'var(--muted-3)',
            opacity: active ? 1 : 0.8,
          }
          return (
            <NavButton
              key={mk.name}
              active={active}
              onClick={() => onMarket(mk.name)}
              right={<span style={tagStyle}>{mk.tag}</span>}
            >
              <span className={styles.flexLabel}>{mk.name}</span>
            </NavButton>
          )
        })}
      </div>
    </aside>
  )
}
