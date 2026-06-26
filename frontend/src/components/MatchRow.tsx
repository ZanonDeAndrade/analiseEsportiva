import type { CSSProperties } from 'react'
import type { Match } from '../types'
import type { MarketColumn } from '../lib/markets'
import { derivedProbs } from '../lib/markets'
import { dotColor } from '../lib/theme'
import FormChips from './FormChips'
import ConfidenceBadge from './ConfidenceBadge'
import styles from './MatchRow.module.css'

interface MatchRowProps {
  match: Match
  def: MarketColumn[]
  selected: boolean
  gridTemplate: string
  showForm: boolean
  onView: (id: string) => void
}

export default function MatchRow({ match, def, selected, gridTemplate, showForm, onView }: MatchRowProps) {
  const probs = derivedProbs(match)
  const values = def.map((c) => probs[c.key])
  const numericValues = values.filter((value): value is number => typeof value === 'number')
  const max = numericValues.length > 0 ? Math.max(...numericValues) : undefined

  const rowStyle: CSSProperties = {
    gridTemplateColumns: gridTemplate,
    borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
    background: selected ? 'rgba(255,106,26,.05)' : undefined,
  }

  return (
    <div className={`${styles.row} ${selected ? styles.selected : ''}`} style={rowStyle}>
      {/* Hora */}
      <div>
        <div className={styles.time}>{match.time}</div>
        <div className={styles.date}>{match.date}</div>
      </div>

      {/* Confronto · Forma */}
      <div className={styles.fixture}>
        <div className={styles.leagueRow}>
          <span
            className={styles.leagueDot}
            style={{ background: dotColor(match.leagueId) }}
          />
          <span className={styles.leagueName}>{match.league}</span>
        </div>
        <div className={styles.teamRow}>
          <span className={`${styles.teamName} ${styles.home}`}>{match.homeTeam}</span>
          {showForm && <FormChips form={match.homeForm} />}
        </div>
        <div className={styles.teamRow}>
          <span className={`${styles.teamName} ${styles.away}`}>{match.awayTeam}</span>
          {showForm && <FormChips form={match.awayForm} />}
        </div>
      </div>

      {/* Market cells */}
      {def.map((c) => {
        const v = probs[c.key]
        const strong = typeof v === 'number' && v >= 65
        const lead = typeof v === 'number' && v === max
        const wrap: CSSProperties = {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 40,
          borderRadius: 6,
          background: lead ? 'rgba(255,106,26,.10)' : 'transparent',
          border: lead ? '1px solid rgba(255,106,26,.22)' : '1px solid transparent',
        }
        const valStyle: CSSProperties = {
          fontSize: 12.5,
          fontWeight: 700,
          color: strong ? 'var(--green-2)' : lead ? 'var(--accent-2)' : 'var(--text-3)',
        }
        return (
          <div key={c.key} style={wrap}>
            <span style={valStyle}>{typeof v === 'number' ? `${v}%` : 'n/d'}</span>
          </div>
        )
      })}

      {/* Confiança */}
      <div className={styles.confCell}>
        <ConfidenceBadge level={match.confidence} />
      </div>

      {/* Ação */}
      <div className={styles.actionCell}>
        <button
          type="button"
          className={`${styles.viewBtn} ${selected ? styles.viewBtnActive : ''}`}
          onClick={() => onView(match.id)}
        >
          Ver análise
        </button>
      </div>
    </div>
  )
}
