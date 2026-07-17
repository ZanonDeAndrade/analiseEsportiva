export interface LegalSection {
  id: string
  title: string
  paragraphs?: string[]
  items?: string[]
  notice?: string
}

export interface LegalDocumentContent {
  title: string
  subtitle: string
  version: string
  publishedAt: string
  effectiveAt: string
  sections: LegalSection[]
  history: Array<{
    version: string
    publishedAt: string
    summary: string
    material: boolean
  }>
}

