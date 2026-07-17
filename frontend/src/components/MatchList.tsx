import type { CSSProperties } from 'react'
import type { Match } from '../types'
import type { MarketColumn } from '../lib/markets'
import MatchRow from './MatchRow'
import { ChartIcon, InfoIcon } from './Icons'
import styles from './MatchList.module.css'
import RiskWarning from './RiskWarning'
import AsyncState from './AsyncState'

interface MatchListProps {
  matches: Match[]
  def: MarketColumn[]
  marketLabel: string
  selectedId: string
  showForm: boolean
  usingFallback: boolean
  demoMode: boolean
  backendError: string | null
  onView: (id: string) => void
  loading: boolean
  onRetry: () => void
}

export default function MatchList({
  matches,
  def,
  marketLabel,
  selectedId,
  showForm,
  usingFallback,
  demoMode,
  backendError,
  onView,
  loading,
  onRetry,
}: MatchListProps) {
  const n = def.length
  const cw = n >= 3 ? 66 : 80
  const gridTemplate = `74px minmax(190px,1fr) repeat(${n}, ${cw}px) 80px 110px`
  const backendOffline = backendError?.startsWith('Backend indisponivel') ?? false

  const headerStyle: CSSProperties = { gridTemplateColumns: gridTemplate }

  return (
    <main id="matchlist" tabIndex={-1} className={styles.main}>
      <div className={styles.inner}>
        {/* Intro */}
        <div className={styles.intro}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Jogos futuros</h1>
            <span className={styles.count}>{matches.length} confrontos</span>
          </div>
          <p className={styles.lead}>
            {demoMode
              ? 'Amostra visual com confrontos e probabilidades simulados para apresentação.'
              : 'Analises educacionais baseadas em fixtures reais, historico local e padroes estatisticos.'}
          </p>
          <div className={styles.metaRow}>
            <div className={`${styles.dataState} ${usingFallback || backendError ? styles.dataWarn : styles.dataOk}`}>
              {demoMode
                ? 'Modo demonstração: dados simulados, sem conexão com casas de apostas.'
                : backendError
                ? backendError
                : usingFallback
                  ? 'Fixture simulada recebida do backend e ocultada no modo de dados reais'
                  : 'Dados reais carregados do backend local'}
            </div>
            <div className={styles.marketRow}>
              <span className={styles.marketRowLabel}>Mercado em exibição</span>
              <span className={styles.marketBadge}>
                <ChartIcon size={12} color="currentColor" strokeWidth={2.2} />
                {marketLabel}
              </span>
            </div>
          </div>
          <RiskWarning variant="analysis" className={styles.inlineRisk} />
        </div>

        {/* Table header */}
        <div className={styles.tableHeader} style={headerStyle}>
          <div className={styles.colLabel}>Hora</div>
          <div className={styles.colLabel}>Confronto · Forma</div>
          {def.map((c) => (
            <div key={c.key} className={styles.marketColWrap}>
              <span className={styles.marketColLabel}>{c.label}</span>
            </div>
          ))}
          <div className={`${styles.colLabel} ${styles.center}`}>Conf.</div>
          <div />
        </div>

        {/* Rows */}
        {matches.map((m) => (
          <MatchRow
            key={m.id}
            match={m}
            def={def}
            selected={m.id === selectedId}
            gridTemplate={gridTemplate}
            showForm={showForm}
            onView={onView}
          />
        ))}

        {matches.length === 0 && (
          <div className={styles.stateSlot}>
            {loading
              ? <AsyncState kind="loading" title="Carregando jogos" detail="Consultando fixtures e predicoes sem usar dados de preenchimento." />
              : backendError
                ? <AsyncState kind="error" title={backendOffline ? 'Backend indisponivel' : 'Dados nao carregados'} detail={backendError} action={{ label: 'Tentar novamente', onClick: onRetry }} />
                : <AsyncState kind="empty" title="Nenhum jogo encontrado" detail="A API nao retornou jogos para os filtros e o periodo selecionados." />}
          </div>
        )}

        {/* Footer disclaimer */}
        <div className={styles.footer}>
          <InfoIcon size={13} color="#5e656f" />
          Probabilidades estimadas. Não são certezas nem recomendações de aposta ou financeiras. Eventos esportivos são imprevisíveis.
        </div>
      </div>
    </main>
  )
}
