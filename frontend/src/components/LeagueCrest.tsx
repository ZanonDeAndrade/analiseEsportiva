import type { LeagueId } from '../types'
import { dotColor } from '../lib/theme'

interface LeagueCrestProps {
  league: LeagueId
  size?: number
}

/**
 * Logos oficiais fornecidas por quem tem a licenca.
 *
 * Vite resolve este glob em tempo de build: so entram arquivos que EXISTEM em
 * `assets/leagues/`. Se a pasta so tem o README, o mapa fica vazio e todo mundo
 * cai no brasao original — sem 404, sem console sujo. Nenhuma logo e reproduzida
 * aqui; o componente apenas exibe o arquivo que o dono do direito colocou.
 * Convencao de nome em `assets/leagues/README.md`.
 */
const officialAssets = import.meta.glob('../assets/leagues/*.{svg,png,webp,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/**
 * Casa pelo primeiro segmento do nome, antes de qualquer ponto. Assim tolera a
 * extensao dupla que o Windows cria ao "renomear para .svg" um PNG/JPG
 * (`BRA.svg.png`, `LL.svg.jpg`): o que importa e o `BRA`/`LL` na frente.
 */
function officialLogo(league: LeagueId): string | undefined {
  for (const path in officialAssets) {
    const base = path.split('/').pop()?.split('.')[0]
    if (base?.toUpperCase() === league.toUpperCase()) return officialAssets[path]
  }
  return undefined
}

/**
 * Marca por competicao. Prefere o logo oficial licenciado quando presente; senao,
 * usa o brasao original (silhueta variada + cor), que nao tem risco de marca.
 */
export default function LeagueCrest({ league, size = 18 }: LeagueCrestProps) {
  const official = officialLogo(league)
  if (official) {
    return (
      <img
        src={official}
        width={size}
        height={size}
        alt=""
        aria-hidden
        style={{ objectFit: 'contain', display: 'block' }}
      />
    )
  }
  return <OriginalCrest league={league} size={size} />
}

/**
 * Brasao ORIGINAL — o fallback. Cada competicao tem uma *silhueta* diferente
 * (escudo, roundel, etiqueta, hexagono e flamula): a forma carrega a informacao,
 * e a cor confirma. Os detalhes sao acenos visuais, nao copias de marcas.
 */
function OriginalCrest({ league, size = 18 }: LeagueCrestProps) {
  const color = dotColor(league)
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.6,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    'aria-hidden': true,
  }
  const wash = { fill: color, fillOpacity: 0.14, stroke: 'none' }

  switch (league) {
    // Brasileirao: escudo arredondado com banda diagonal.
    case 'BRA':
      return (
        <svg {...common}>
          <path {...wash} d="M12 2.5l8 2.6v6C20 16.6 16.4 20 12 21.5 7.6 20 4 16.6 4 11.1v-6z" />
          <path d="M12 2.5l8 2.6v6C20 16.6 16.4 20 12 21.5 7.6 20 4 16.6 4 11.1v-6z" />
          <path d="M8.5 8.5l7 7" />
        </svg>
      )
    // Premier League: roundel com barra horizontal.
    case 'PL':
      return (
        <svg {...common}>
          <circle {...wash} cx="12" cy="12" r="9.2" />
          <circle cx="12" cy="12" r="9.2" />
          <path d="M7.5 12h9" />
        </svg>
      )
    // La Liga: etiqueta arredondada com barra vertical.
    case 'LL':
      return (
        <svg {...common}>
          <rect {...wash} x="3.5" y="3.5" width="17" height="17" rx="5" />
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <path d="M12 8v8" />
        </svg>
      )
    // Ligue 1: hexagono — "l'Hexagone", a Franca — com ponto central.
    case 'L1':
      return (
        <svg {...common}>
          <path {...wash} d="M12 2.8l7.5 4.3v9.8L12 21.2 4.5 16.9V7.1z" />
          <path d="M12 2.8l7.5 4.3v9.8L12 21.2 4.5 16.9V7.1z" />
          <circle cx="12" cy="12" r="1.9" fill={color} stroke="none" />
        </svg>
      )
    // Bundesliga: flamula angular com tri-faixa (aceno a bandeira alema).
    case 'BUN':
      return (
        <svg {...common}>
          <path {...wash} d="M5 3.5h14v11l-7 6-7-6z" />
          <path d="M5 3.5h14v11l-7 6-7-6z" />
          <path d="M8 8h8M8 11h8M8 14h8" />
        </svg>
      )
    default:
      return null
  }
}

/** Marca de "Todas as ligas": quatro modulos, evocando um mosaico de competicoes. */
export function AllLeaguesCrest({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--muted-4, #7d848d)"
      strokeWidth={1.6}
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.6" />
    </svg>
  )
}
