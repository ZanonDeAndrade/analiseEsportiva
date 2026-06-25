import type { Confidence } from '../types'
import { confChipStyle } from '../lib/theme'

interface ConfidenceBadgeProps {
  level: Confidence
  /** Override the label (e.g. "Alto" instead of "Alta"). */
  label?: string
}

export default function ConfidenceBadge({ level, label }: ConfidenceBadgeProps) {
  return <span style={confChipStyle(level)}>{label ?? level}</span>
}
