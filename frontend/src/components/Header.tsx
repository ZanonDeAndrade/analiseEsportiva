import { LogoMark, MenuIcon, SearchIcon, SparkIcon } from './Icons'
import styles from './Header.module.css'

interface HeaderProps {
  query: string
  onSearch: (value: string) => void
  aiOn: boolean
  onToggleAI: () => void
  onOpenMenu: () => void
  dataStatus: 'real' | 'demo' | 'warning' | 'offline'
  userName?: string
  onOpenAccount: () => void
  onLogout: () => void
}

export default function Header({
  query,
  onSearch,
  aiOn,
  onToggleAI,
  onOpenMenu,
  dataStatus,
  userName,
  onOpenAccount,
  onLogout,
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
      >
        <MenuIcon size={18} />
      </button>

      <div className={styles.brand}>
        <div className={styles.logo}>
          <LogoMark />
        </div>
        <div className={styles.wordmark}>
          BetIntel<span>&nbsp;AI</span>
        </div>
      </div>

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
      >
        <SparkIcon size={14} color="currentColor" />
        Análise IA
        <span className={`${styles.aiDot} ${aiOn ? styles.aiDotOn : ''}`} />
      </button>

      <div id="hdr-extra" className={styles.status}>
        <span className={`${styles.statusDot} ${dotClass}`} />
        {statusText}
      </div>

      <button type="button" className={styles.accountBtn} onClick={onOpenAccount}>
        {userName ?? 'Conta'}
      </button>
      <button type="button" className={styles.logoutBtn} onClick={onLogout}>
        Sair
      </button>

      <div className={styles.disclaimer}>Probabilidades estimadas, não recomendações financeiras.</div>
    </header>
  )
}
