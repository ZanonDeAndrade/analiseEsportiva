import type { CSSProperties } from 'react'
import type { Match, RecentMatch } from '../types'
import { buildAnalysis } from '../lib/analysis'
import { confChipStyle, formChipStyle } from '../lib/theme'
import { CloseIcon, InfoIcon, SparkIcon } from './Icons'
import styles from './AnalysisPanel.module.css'
import RiskWarning from './RiskWarning'
import { insufficientDataNotice } from '../legal/risk-warnings'

interface AnalysisPanelProps {
  match: Match
  aiOn: boolean
  open: boolean
  onClose: () => void
}

function RecentRow({ item }: { item: RecentMatch }) {
  return (
    <div className={styles.recentRow}>
      <span style={formChipStyle(item.result)}>{item.result}</span>
      <span className={styles.recentOpp}>{item.opponent}</span>
      <span className={styles.recentScore}>{item.score}</span>
    </div>
  )
}

export default function AnalysisPanel({ match, aiOn, open, onClose }: AnalysisPanelProps) {
  const a = buildAnalysis(match)

  return (
    <aside id="analysis" aria-label="Detalhe da analise" tabIndex={0} className={`${styles.panel} ${open ? styles.open : ''}`}>
      <div className={styles.body}>
        <div className={styles.topRow}>
          <div className={styles.aiBadge}>
            <SparkIcon size={13} color="#ff8c42" rays={false} />
            <span>Análise IA</span>
          </div>
          <div className={styles.topRight}>
            <span className={styles.confidenceText}>{a.confidenceText}</span>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Fechar análise"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        <ol className={styles.evidenceRail} aria-label="Trilho de evidencia da predicao">
          <li><span>01</span><div><small>ORIGEM</small><b>{match.sourceProvider ?? 'nao informada'}</b></div></li>
          <li><span>02</span><div><small>PERIODO</small><b>{formatPeriod(match.modelPeriod)}</b></div></li>
          <li><span>03</span><div><small>AMOSTRA</small><b>{match.sampleSize ?? 'n/d'}</b></div></li>
          <li><span>04</span><div><small>MODELO</small><b>{shortVersion(match.modelVersion)}</b></div></li>
        </ol>

        <h2 className={styles.title}>{a.title}</h2>
        <div className={styles.leagueDate}>{a.leagueDate}</div>

        {aiOn ? (
          <div className={styles.summaryBox}>
            <p className={styles.summaryText}>{match.aiSummary}</p>
          </div>
        ) : (
          <div className={styles.summaryOff}>
            <p>
              Ative <b>Análise IA</b> no topo para ver o resumo em linguagem natural.
            </p>
          </div>
        )}

        <div className={styles.metaGrid}>
          <div>
            <span>Competicao</span>
            <b>{match.competition ?? match.league}</b>
          </div>
          <div>
            <span>Fonte</span>
            <b>{match.sourceProvider ?? 'backend-local'}</b>
          </div>
          <div>
            <span>Atualizado</span>
            <b>{formatUpdatedAt(match.updatedAt)}</b>
          </div>
          <div>
            <span>Amostra</span>
            <b>{match.sampleSize ?? 'n/d'}</b>
          </div>
          <div>
            <span>Modelo</span>
            <b>{shortVersion(match.modelVersion)}</b>
          </div>
          <div>
            <span>Período</span>
            <b>{formatPeriod(match.modelPeriod)}</b>
          </div>
        </div>

        <RiskWarning variant="analysis" />

        {match.backendError && <div className={styles.predictionError} role="alert"><b>Predicao indisponivel</b><span>{match.backendError}</span><small>A fixture continua visivel, mas nenhuma probabilidade foi substituida por valor ficticio.</small></div>}

        {match.availableMarkets?.length === 0 && (
          <div className={styles.insufficientData} role="status">{insufficientDataNotice}</div>
        )}

        {match.availableMarkets && match.availableMarkets.length > 0 && (
          <>
            <div className={styles.sectionLabel}>Mercados disponiveis</div>
            <div className={styles.marketChips}>
              {match.availableMarkets.map((market) => (
                <span key={market.market}>{market.displayName}</span>
              ))}
            </div>
            <div className={styles.intervalPlots} aria-label="Intervalos de confianca em escala de zero a cem por cento">
              {match.availableMarkets.slice(0, 2).flatMap((market) => market.selections.slice(0, 3).map((selection) => (
                <div className={styles.intervalPlot} key={`${market.market}-${selection.key}`}>
                  <div className={styles.plotLabel}><span>{market.displayName} · {selection.label}</span><b>{selection.probability}%</b></div>
                  <div className={styles.plotScale} role="img" aria-label={`${selection.probability} por cento; intervalo de ${selection.uncertainty.lower} a ${selection.uncertainty.upper} por cento`}>
                    <span className={styles.plotInterval} style={{ left: `${selection.uncertainty.lower}%`, width: `${Math.max(0, selection.uncertainty.upper - selection.uncertainty.lower)}%` }} />
                    <span className={styles.plotPoint} style={{ left: `${selection.probability}%` }} />
                  </div>
                  <div className={styles.plotAxis}><span>0%</span><span>50%</span><span>100%</span></div>
                  <small>IC 95% Wilson · n={market.sampleSize}</small>
                </div>
              ))) }
            </div>
            <div className={styles.ignoredList}>
              {match.availableMarkets.slice(0, 3).map((market) => (
                <div key={`explain-${market.market}`}>
                  <b>{market.displayName}: segmento {market.sourceSegment}</b>
                  <span>{market.sampleSize} observações · período {market.period.from} a {market.period.to}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {match.limitations && match.limitations.length > 0 && <>
          <div className={styles.sectionLabel}>Limitações</div>
          <div className={styles.ignoredList}>{match.limitations.map((limitation) => <div key={limitation}><span>{limitation}</span></div>)}</div>
        </>}

        {match.ignoredMarkets && match.ignoredMarkets.length > 0 && (
          <>
            <div className={styles.sectionLabel}>Ignorados por dados insuficientes</div>
            <div className={styles.ignoredList}>
              {match.ignoredMarkets.slice(0, 5).map((market) => (
                <div key={market.market}>
                  <b>{market.displayName}</b>
                  <span>{market.reason}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Indicadores */}
        <div className={styles.sectionLabel}>Indicadores do confronto</div>
        <div className={styles.statGrid}>
          {a.stats.map((s) => (
            <div key={s.label} className={styles.statCard}>
              <div className={styles.statLabel}>{s.label}</div>
              <div
                className={styles.statValue}
                style={{ color: s.strong ? 'var(--green-2)' : 'var(--text)' }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Últimos 5 jogos */}
        <div className={styles.sectionLabel}>Últimos 5 jogos</div>
        <div className={styles.last5Grid}>
          <div>
            <div className={styles.teamHeading}>{match.homeTeam}</div>
            <div className={styles.recentList}>
              {match.lastMatchesHome.map((r, i) => (
                <RecentRow key={i} item={r} />
              ))}
            </div>
          </div>
          <div>
            <div className={styles.teamHeading}>{match.awayTeam}</div>
            <div className={styles.recentList}>
              {match.lastMatchesAway.map((r, i) => (
                <RecentRow key={i} item={r} />
              ))}
            </div>
          </div>
        </div>

        {/* Mercados com melhor evidência */}
        <div className={styles.sectionLabel}>Mercados com melhor evidência</div>
        <div className={styles.evidenceList}>
          {a.evidenceMarkets.map((bm) => {
            const valueColor = bm.strong ? '#3bd17a' : bm.value >= 50 ? '#e0a92e' : '#ec6b67'
            const fillStyle: CSSProperties = {
              height: '100%',
              width: bm.value + '%',
              borderRadius: 4,
              background: bm.strong
                ? 'linear-gradient(90deg,#2fbd6b,#3bd17a)'
                : 'linear-gradient(90deg,#ff6a1a,#ff9d4d)',
            }
            return (
              <div key={bm.label}>
                <div className={styles.evidenceTop}>
                  <span className={styles.evidenceLabel}>{bm.label}</span>
                  <span className={styles.evidenceValue} style={{ color: valueColor }}>
                    {bm.valueText}
                  </span>
                </div>
                <div className={styles.evidenceTrack}>
                  <div style={fillStyle} />
                </div>
                <div className={styles.plotAxis}><span>0%</span><span>50%</span><span>100%</span></div>
              </div>
            )
          })}
        </div>

        {/* Nível de confiança */}
        <div className={styles.confBox}>
          <span className={styles.confBoxLabel}>Nível de confiança</span>
          <span style={confChipStyle(match.confidence)}>{a.confidenceLabel}</span>
        </div>

        <div className={styles.note}>
          <InfoIcon size={13} color="#5e656f" style={{ flexShrink: 0, marginTop: 1 }} />
          <p>{match.ethicalNotice ?? 'Analise baseada em dados historicos. Nao garante resultado.'}</p>
        </div>
      </div>
    </aside>
  )
}

function formatUpdatedAt(value: string | undefined) {
  if (!value) return 'n/d'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function shortVersion(value: string | undefined) {
  if (!value) return 'n/d'
  return value.length > 12 ? value.slice(0, 12) : value
}

function formatPeriod(value: { from: string; to: string } | undefined) {
  return value ? `${value.from} – ${value.to}` : 'n/d'
}
