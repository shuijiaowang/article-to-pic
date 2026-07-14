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
  /** 封面区：只描述封面需求 */
  cover: string
  /** 正文区：有序正文 */
  body: string
  /** 备注区：大方向、配色、结构、分页等 */
  notes: string
  createdAt: number
  updatedAt: number
  /** @deprecated 旧版单 content，加载时迁移到 body */
  content?: string
  /** @deprecated 旧版单 HTML 字段，加载时会迁移到 htmlVersions */
  generatedHtml?: string
  htmlGeneratedAt?: number
  htmlSummary?: string
  htmlVersions?: ArticleHtmlVersion[]
  activeHtmlVersionId?: string
}

export type ArticleInput = Pick<Article, 'title' | 'cover' | 'body' | 'notes'>

/** 旧 content → body；补齐 cover/body/notes */
export function migrateArticleFields(article: Article): Article {
  const legacy = article as Article & { content?: string }
  if (typeof legacy.content === 'string') {
    const hasNewFields =
      typeof article.cover === 'string' ||
      typeof article.body === 'string' ||
      typeof article.notes === 'string'
    if (!hasNewFields) {
      article.body = legacy.content
    } else if (!article.body?.trim() && legacy.content.trim()) {
      article.body = legacy.content
    }
    delete legacy.content
  }

  article.cover ??= ''
  article.body ??= ''
  article.notes ??= ''
  return article
}

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

export function migrateArticle(article: Article): Article {
  return migrateArticleHtml(migrateArticleFields(article))
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
