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

/* -------------------------------------------------------------------------
   Navegacao do produto. Em vez de metaforas genericas de SaaS (grade, sino,
   pessoas, interrogacao) — o padrao que faz um menu parecer template — cada
   item usa o vernaculo do proprio futebol: campo, bandeira de escanteio,
   formacao, apito. O metaforico vem do assunto, nao de um pacote de icones.
   ------------------------------------------------------------------------- */

/** Jogos e analises: o campo visto de cima, com linha central e circulo. */
export function PitchIcon({ size = 18, color = 'currentColor', strokeWidth = 1.9 }: IconProps) {
  return (
    <svg {...base(size, color, strokeWidth)}>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M12 5v14" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  )
}

/** Consultas e alertas: a bandeira de escanteio — do futebol, e ao mesmo tempo
    "marcado/sinalizado". Um duplo sentido que um sino generico nao carrega. */
export function CornerFlagIcon({ size = 18, color = 'currentColor', strokeWidth = 1.9 }: IconProps) {
  return (
    <svg {...base(size, color, strokeWidth)}>
      <path d="M7 21V4" />
      <path d="M7 4l11 3-11 3" />
      <path d="M4 21h7" />
    </svg>
  )
}

/** Equipe: uma formacao em campo — o modo como o futebol nomeia um elenco.
    Pontos preenchidos num 1-3-2, nao o icone generico de duas pessoas. */
export function FormationIcon({ size = 18, color = 'currentColor' }: IconProps) {
  const dot = (cx: number, cy: number) => <circle cx={cx} cy={cy} r="1.7" fill={color} stroke="none" />
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {dot(12, 4)}
      {dot(5, 11)}
      {dot(12, 11)}
      {dot(19, 11)}
      {dot(8, 19)}
      {dot(16, 19)}
    </svg>
  )
}

/** Plano e uso: um medidor — a mesma linguagem das barras de consumo do produto. */
export function GaugeIcon({ size = 18, color = 'currentColor', strokeWidth = 1.9 }: IconProps) {
  return (
    <svg {...base(size, color, strokeWidth)}>
      <path d="M4 17a8 8 0 0 1 16 0" />
      <path d="M12 17l4.5-4.5" />
      <circle cx="12" cy="17" r="1.1" fill={color} stroke="none" />
    </svg>
  )
}

/** Conta e seguranca: escudo com fechadura. Silhueta angular, nao o escudo
    arredondado padrao de biblioteca. */
export function ShieldKeyIcon({ size = 18, color = 'currentColor', strokeWidth = 1.9 }: IconProps) {
  return (
    <svg {...base(size, color, strokeWidth)}>
      <path d="M12 3l8 3v5c0 5-4 8.5-8 10-4-1.5-8-5-8-10V6z" />
      <circle cx="12" cy="10.5" r="1.7" />
      <path d="M12 12.2V15" />
    </svg>
  )
}

/** Ajuda e suporte: o apito do arbitro — quem interrompe e orienta. Muito mais
    do assunto do que a interrogacao num circulo. */
export function WhistleIcon({ size = 18, color = 'currentColor', strokeWidth = 1.9 }: IconProps) {
  return (
    <svg {...base(size, color, strokeWidth)}>
      <path d="M12 9h9a1 1 0 0 1 1 1v1.5a1 1 0 0 1-1 1h-2" />
      <circle cx="9" cy="15" r="5.5" />
      <path d="M9 9V6.5" />
    </svg>
  )
}

/** Operacao interna: controles de mesa. */
export function SlidersIcon({ size = 18, color = 'currentColor', strokeWidth = 1.9 }: IconProps) {
  return (
    <svg {...base(size, color, strokeWidth)}>
      <path d="M4 8h16M4 16h16" />
      <circle cx="15" cy="8" r="2.2" fill={color} stroke="none" />
      <circle cx="9" cy="16" r="2.2" fill={color} stroke="none" />
    </svg>
  )
}
