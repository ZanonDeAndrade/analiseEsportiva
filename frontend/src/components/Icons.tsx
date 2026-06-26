/* Line icons used across the UI, taken from the design export.
   All inherit `currentColor` unless a color is passed. */

interface IconProps {
  size?: number
  color?: string
  strokeWidth?: number
  className?: string
  style?: React.CSSProperties
}

function base(size: number, color: string, strokeWidth: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

export function LogoMark({ size = 17, color = '#0e1115' }: IconProps) {
  return (
    <svg {...base(size, color, 2.4)}>
      <path d="M4 19V11" />
      <path d="M10 19V5" />
      <path d="M16 19v-6" />
      <path d="M3 19h18" />
      <circle cx="16" cy="7" r="2" fill={color} stroke="none" />
    </svg>
  )
}

export function SearchIcon({ size = 15, color = '#6b727c', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, color, strokeWidth)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function SparkIcon({ size = 14, color = 'currentColor', strokeWidth = 2, rays = true, style }: IconProps & { rays?: boolean }) {
  return (
    <svg {...base(size, color, strokeWidth)} style={style}>
      {rays ? (
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
      ) : (
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
      )}
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  )
}

export function ListIcon({ size = 13, color = '#5e656f', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, color, strokeWidth)}>
      <path d="M3 6h18M3 12h18M3 18h12" />
    </svg>
  )
}

export function CalendarIcon({ size = 13, color = '#5e656f', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, color, strokeWidth)}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

export function ChartIcon({ size = 13, color = '#5e656f', strokeWidth = 2, style }: IconProps) {
  return (
    <svg {...base(size, color, strokeWidth)} style={style}>
      <path d="M3 3v18h18" />
      <path d="m7 14 3-3 3 2 4-5" />
    </svg>
  )
}

export function InfoIcon({ size = 13, color = '#5e656f', strokeWidth = 2, style }: IconProps) {
  return (
    <svg {...base(size, color, strokeWidth)} style={style}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16.5h.01" />
    </svg>
  )
}

export function MenuIcon({ size = 18, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, color, strokeWidth)}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}

export function CloseIcon({ size = 18, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...base(size, color, strokeWidth)}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}
