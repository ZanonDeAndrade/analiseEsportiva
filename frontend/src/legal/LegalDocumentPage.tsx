import { useEffect, useState } from 'react'
import RiskWarning from '../components/RiskWarning'
import type { LegalDocumentContent, LegalSection } from './types'
import { legalDraftWarning, legalLinks } from './legal-config'
import styles from './LegalPages.module.css'

export default function LegalDocumentPage({
  content,
  showRisk = false,
}: {
  content: LegalDocumentContent
  showRisk?: boolean
}) {
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = `${content.title} | BetIntel AI`
    setMeta('description', `${content.title} do BetIntel AI, versão ${content.version}. Minuta sujeita à revisão jurídica.`)
    setMeta('robots', 'index,follow')
    setMetaProperty('og:title', `${content.title} | BetIntel AI`)
    setMetaProperty('og:type', 'article')
    setCanonical(`${window.location.origin}${window.location.pathname}`)
    return () => { document.title = previousTitle }
  }, [content])

  const copySection = async (section: LegalSection) => {
    const url = `${window.location.origin}${window.location.pathname}#${section.id}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const input = document.createElement('textarea')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      input.remove()
    }
    setCopied(section.id)
    window.setTimeout(() => setCopied(null), 1800)
  }

  return (
    <div className={styles.pageShell}>
      <a className={styles.skipLink} href="#conteudo-juridico">Ir para o conteúdo</a>
      <header className={styles.header}>
        <a className={styles.brand} href="/">BetIntel <span>AI</span></a>
        <nav aria-label="Documentos jurídicos">
          {legalLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
          <a href="/planos">Planos</a>
        </nav>
      </header>

      <main id="conteudo-juridico" className={styles.layout}>
        <aside className={styles.toc} aria-label="Índice">
          <strong>Nesta página</strong>
          <ul>
            {content.sections.map((section) => (
              <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>
            ))}
          </ul>
        </aside>

        <article className={styles.document}>
          <div className={styles.draft} role="alert">{legalDraftWarning}</div>
          <div className={styles.eyebrow}>Documento jurídico · minuta</div>
          <h1>{content.title}</h1>
          <p className={styles.subtitle}>{content.subtitle}</p>
          <dl className={styles.metadata}>
            <div><dt>Versão</dt><dd>{content.version}</dd></div>
            <div><dt>Publicação</dt><dd>{content.publishedAt}</dd></div>
            <div><dt>Vigência</dt><dd>{content.effectiveAt}</dd></div>
          </dl>
          <div className={styles.actions}>
            <button type="button" onClick={() => window.print()}>Imprimir / salvar em PDF</button>
            <button type="button" onClick={() => downloadDocument(content)}>Baixar em HTML</button>
          </div>

          {showRisk && <RiskWarning variant="summary" showLiability />}

          {content.sections.map((section) => (
            <section key={section.id} id={section.id} className={styles.section}>
              <div className={styles.sectionHeading}>
                <h2>{section.title}</h2>
                <button
                  type="button"
                  className={styles.copyButton}
                  onClick={() => void copySection(section)}
                  aria-label={`Copiar link para ${section.title}`}
                >
                  {copied === section.id ? 'Link copiado' : 'Copiar link'}
                </button>
              </div>
              {section.notice && <div className={styles.notice}>{section.notice}</div>}
              {section.paragraphs?.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              {section.items && <ul>{section.items.map((item, index) => <li key={index}>{item}</li>)}</ul>}
            </section>
          ))}

          <section className={styles.history} aria-labelledby="historico-titulo">
            <h2 id="historico-titulo">Histórico de versões</h2>
            <div className={styles.historyTable} role="table" aria-label="Histórico de versões">
              {content.history.map((entry) => (
                <div key={entry.version} role="row">
                  <span role="cell">Versão {entry.version}</span>
                  <span role="cell">{entry.publishedAt}</span>
                  <span role="cell">{entry.summary}</span>
                  <span role="cell">{entry.material ? 'Alteração material' : 'Alteração não material'}</span>
                </div>
              ))}
            </div>
          </section>
        </article>
      </main>
      <footer className={styles.footer}>
        <RiskWarning variant="footer" />
        <span>Documento de trabalho. Direitos obrigatórios permanecem preservados.</span>
      </footer>
    </div>
  )
}

function setMeta(name: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.name = name
    document.head.appendChild(element)
  }
  element.content = content
}

function setMetaProperty(property: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute('property', property)
    document.head.appendChild(element)
  }
  element.content = content
}

function setCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!element) {
    element = document.createElement('link')
    element.rel = 'canonical'
    document.head.appendChild(element)
  }
  element.href = href
}

function downloadDocument(content: LegalDocumentContent) {
  const sections = content.sections.map((section) => `
    <section id="${escapeHtml(section.id)}">
      <h2>${escapeHtml(section.title)}</h2>
      ${section.notice ? `<blockquote>${escapeHtml(section.notice)}</blockquote>` : ''}
      ${(section.paragraphs ?? []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
      ${section.items ? `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    </section>`).join('')
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(content.title)}</title></head><body><main><h1>${escapeHtml(content.title)}</h1><p>Versão ${escapeHtml(content.version)} · Publicação ${escapeHtml(content.publishedAt)} · Vigência ${escapeHtml(content.effectiveAt)}</p><strong>${escapeHtml(legalDraftWarning)}</strong>${sections}</main></body></html>`
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${slug(content.title)}-v${content.version}.html`
  link.click()
  URL.revokeObjectURL(url)
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  })[character] ?? character)
}

function slug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}
