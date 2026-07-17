import styles from './Spinner.module.css'

/**
 * Bolinha de carregamento girando — o indicador unico de "algo em andamento" no
 * app. Usado em toda tela de espera (auth, workspace, paginas, dados) para o
 * feedback ser sempre o mesmo. Acessivel: anuncia "Carregando" ao leitor de tela.
 */
export default function Spinner({
  size = 22,
  label = 'Carregando',
}: {
  size?: number
  label?: string
}) {
  return (
    <span
      className={styles.spinner}
      role="status"
      aria-label={label}
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 11)) }}
    />
  )
}
