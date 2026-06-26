import type { Result } from '../types'
import { formChipStyle } from '../lib/theme'

interface FormChipsProps {
  form: Result[]
  gap?: number
}

/** Row of V/E/D form chips. */
export default function FormChips({ form, gap = 3 }: FormChipsProps) {
  return (
    <div style={{ display: 'flex', gap }}>
      {form.map((letter, i) => (
        <span key={i} style={formChipStyle(letter)}>
          {letter}
        </span>
      ))}
    </div>
  )
}
