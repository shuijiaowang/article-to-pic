export interface ArticleHtmlVersion {
  id: string
  html: string
  createdAt: number
  summary?: string
  /** 展示用标签，如「版本 1」 */
  label?: string
}

export interface Article {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
  /** @deprecated 旧版单 HTML 字段，加载时会迁移到 htmlVersions */
  generatedHtml?: string
  htmlGeneratedAt?: number
  htmlSummary?: string
  htmlVersions?: ArticleHtmlVersion[]
  activeHtmlVersionId?: string
}

export type ArticleInput = Pick<Article, 'title' | 'content'>

export function migrateArticleHtml(article: Article): Article {
  if (article.htmlVersions?.length) return article
  if (!article.generatedHtml) return article

  const versionId = crypto.randomUUID()
  article.htmlVersions = [
    {
      id: versionId,
      html: article.generatedHtml,
      createdAt: article.htmlGeneratedAt ?? article.updatedAt,
      summary: article.htmlSummary,
      label: '版本 1',
    },
  ]
  article.activeHtmlVersionId = versionId
  return article
}

export function getArticleHtmlVersions(article: Article | null | undefined): ArticleHtmlVersion[] {
  if (!article) return []
  return article.htmlVersions ?? []
}

export function getActiveHtmlVersion(article: Article | null | undefined): ArticleHtmlVersion | null {
  if (!article?.htmlVersions?.length) return null
  const active = article.htmlVersions.find((v) => v.id === article.activeHtmlVersionId)
  return active ?? article.htmlVersions[article.htmlVersions.length - 1] ?? null
}

export function hasArticleHtml(article: Article | null | undefined): boolean {
  return getArticleHtmlVersions(article).length > 0 || !!article?.generatedHtml
}
