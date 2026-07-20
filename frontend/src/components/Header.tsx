import betIntelLogo from '../assets/betintel-logo.png'
import { MenuIcon, SearchIcon, SparkIcon } from './Icons'
import styles from './Header.module.css'
import type { OrganizationSummary } from '../lib/saasApi'

interface HeaderProps {
  query: string
  onSearch: (value: string) => void
  aiOn: boolean
  onToggleAI: () => void
  onOpenMenu: () => void
  menuOpen: boolean
  dataStatus: 'real' | 'demo' | 'warning' | 'offline'
  userName?: string
  onOpenAccount: () => void
  onLogout: () => void
  onOpenDataOperations?: () => void
  organizations: OrganizationSummary[]
  activeOrganizationId?: string
  onSwitchOrganization: (organizationId: string) => void
  onRefresh: () => void
  refreshing: boolean
}

export default function Header({
  query,
  onSearch,
  aiOn,
  onToggleAI,
  onOpenMenu,
  menuOpen,
  dataStatus,
  userName,
  onOpenAccount,
  onLogout,
  onOpenDataOperations,
  organizations,
  activeOrganizationId,
  onSwitchOrganization,
  onRefresh,
  refreshing,
}: HeaderProps) {
  const statusText =
    dataStatus === 'offline'
      ? 'Backend offline'
      : dataStatus === 'demo'
        ? 'Modo demonstração'
      : dataStatus === 'warning'
        ? 'Dados reais com aviso'
        : 'Dados reais'
  const dotClass =
    dataStatus === 'offline'
      ? styles.statusDotError
      : dataStatus === 'warning' || dataStatus === 'demo'
        ? styles.statusDotWarn
        : ''

  return (
    <header className={styles.header}>
      <button
        type="button"
        className={styles.menuBtn}
        onClick={onOpenMenu}
        aria-label="Abrir filtros"
        aria-expanded={menuOpen}
        aria-controls="sidebar"
      >
        <MenuIcon size={18} />
      </button>

      <div className={styles.brand}>
        <div className={styles.logo}>
          <img src={betIntelLogo} alt="" />
        </div>
        <div className={styles.wordmark}>
          BetIntel<span>&nbsp;AI</span>
        </div>
      </div>

      {organizations.length > 1 && <label className={styles.organizationPicker}>
        <span>{'Organiza\u00e7\u00e3o ativa'}</span>
        <select
          value={activeOrganizationId ?? ''}
          onChange={(event) => onSwitchOrganization(event.target.value)}
          aria-label={'Organiza\u00e7\u00e3o ativa'}
        >
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>{organization.name}</option>
          ))}
        </select>
      </label>}

      <label className={styles.search}>
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Buscar time ou liga"
          aria-label="Buscar time ou liga"
        />
      </label>

      <div className={styles.spacer} />

      <button
        type="button"
        onClick={onToggleAI}
        className={`${styles.aiBtn} ${aiOn ? styles.aiOn : ''}`}
        aria-pressed={aiOn}
        aria-label={`Análise IA: ${aiOn ? 'ativada' : 'desativada'}`}
      >
        <SparkIcon size={14} color="currentColor" />
        <span className={styles.aiLabel}>Análise IA</span>
        <span className={`${styles.aiDot} ${aiOn ? styles.aiDotOn : ''}`} />
      </button>

      <div id="hdr-extra" className={styles.status}>
        <span className={`${styles.statusDot} ${dotClass}`} />
        {statusText}
      </div>

      <button type="button" className={styles.refreshBtn} onClick={onRefresh} disabled={refreshing}>
        {refreshing ? 'Atualizando\u2026' : 'Atualizar'}
      </button>

      <button type="button" className={styles.accountBtn} aria-label="Abrir conta e segurança" onClick={onOpenAccount}>
        <span className={styles.accountName}>{userName ?? 'Conta'}</span>
        <span className={styles.mobileButtonLabel} aria-hidden="true">C</span>
      </button>
      {onOpenDataOperations && <button type="button" className={`${styles.accountBtn} ${styles.dataBtn}`} aria-label="Operação de dados" onClick={onOpenDataOperations}><span className={styles.dataLabel}>Dados</span><span className={styles.mobileButtonLabel} aria-hidden="true">D</span></button>}
      <button type="button" className={styles.logoutBtn} onClick={onLogout}>
        Sair
      </button>

      <div className={styles.disclaimer}>Probabilidades estimadas, não recomendações financeiras.</div>
    </header>
  )
}
