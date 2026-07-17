import type { CSSProperties } from 'react'
import type { LeagueId, Period } from '../types'
import { LEAGUES } from '../data/leagues'
import { MARKETS } from '../lib/markets'
import NavButton from './NavButton'
import {
  CalendarIcon,
  ChartIcon,
  CloseIcon,
  GaugeIcon,
  ListIcon,
  PitchIcon,
  ShieldKeyIcon,
  SlidersIcon,
  WhistleIcon,
} from './Icons'
import LeagueCrest, { AllLeaguesCrest } from './LeagueCrest'
import styles from './Sidebar.module.css'
import type { OrganizationSummary } from '../lib/saasApi'

/** Cada item de navegacao usa uma marca do proprio futebol, nao um icone generico. */
const NAV_ICON: Record<WorkspaceView, (props: { size?: number; color?: string }) => JSX.Element> = {
  dashboard: PitchIcon,
  billing: GaugeIcon,
  account: ShieldKeyIcon,
  support: WhistleIcon,
  admin: SlidersIcon,
}

function NavGlyph({ view, active }: { view: WorkspaceView; active: boolean }) {
  const Icon = NAV_ICON[view]
  return (
    <span className={styles.navIcon}>
      <Icon size={18} color={active ? 'var(--signal, #ff8c42)' : 'var(--muted-4, #7d848d)'} />
    </span>
  )
}

export type LeagueFilter = LeagueId | 'todas'
export type PeriodFilter = Period | 'todos'
export type WorkspaceView = 'dashboard' | 'billing' | 'account' | 'support' | 'admin'

interface SidebarProps {
  league: LeagueFilter
  period: PeriodFilter
  market: string
  counts: Record<string, number>
  onLeague: (id: LeagueFilter) => void
  onPeriod: (id: PeriodFilter) => void
  onMarket: (name: string) => void
  activeView: WorkspaceView
  onNavigate: (view: WorkspaceView) => void
  organizations: OrganizationSummary[]
  activeOrganizationId?: string
  onSwitchOrganization: (organizationId: string) => void
  platformAdmin: boolean
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
  activeView,
  onNavigate,
  organizations,
  activeOrganizationId,
  onSwitchOrganization,
  platformAdmin,
  open,
  onClose,
}: SidebarProps) {
  return (
    <aside id="sidebar" aria-label="Navegacao e filtros" className={`${styles.sidebar} ${open ? styles.open : ''}`}>
      <div className={styles.mobileHeader}>
        <span>{'Navega\u00e7\u00e3o'}</span>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar filtros">
          <CloseIcon size={18} />
        </button>
      </div>

      <nav aria-label={'Navega\u00e7\u00e3o principal'} className={styles.productNav}>
        {organizations.length > 1 && <label className={styles.sidebarOrganization}>
          <span>{'Espa\u00e7o de trabalho'}</span>
          <select aria-label={'Organiza\u00e7\u00e3o ativa no menu'} value={activeOrganizationId ?? ''} onChange={(event) => onSwitchOrganization(event.target.value)}>
            {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>
        </label>}
        {([
          ['dashboard', 'Jogos e an\u00e1lises'],
        ] as const).map(([view, label]) => (
          <NavButton key={view} active={activeView === view} bar onClick={() => onNavigate(view)}>
            <NavGlyph view={view} active={activeView === view} />
            <span className={styles.flexLabel}>{label}</span>
          </NavButton>
        ))}
        {([
          ['billing', 'Plano e uso'],
          ['account', 'Conta e seguran\u00e7a'],
          ['support', 'Ajuda e suporte'],
        ] as const).map(([view, label]) => (
          <NavButton key={view} active={activeView === view} bar onClick={() => onNavigate(view)}>
            <NavGlyph view={view} active={activeView === view} />
            <span className={styles.flexLabel}>{label}</span>
          </NavButton>
        ))}
        {platformAdmin && <NavButton active={activeView === 'admin'} bar onClick={() => onNavigate('admin')}>
          <NavGlyph view="admin" active={activeView === 'admin'} /><span className={styles.flexLabel}>Operacao interna</span>
        </NavButton>}
      </nav>

      {activeView === 'dashboard' && <>
      <div className={styles.filterDivider} />

      {/* Ligas */}
      <div className={styles.sectionLabel}>
        <ListIcon /> Ligas
      </div>
      <div className={styles.group}>
        {LEAGUE_OPTIONS.map((lg) => {
          const active = league === lg.id
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
              <span className={styles.crest}>
                {lg.dot ? <LeagueCrest league={lg.dot} size={18} /> : <AllLeaguesCrest size={18} />}
              </span>
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
      </>}
    </aside>
  )
}
