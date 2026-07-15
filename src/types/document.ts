export interface ArticleHtmlVersion {
  id: string
  html: string
  createdAt: number
  summary?: string
  /** 展示用标签，如「版本 1」「AI 修改」 */
  label?: string
}

/**
 * 文稿（项目）。
 * HTML 多版本挂在**单个文稿**下：`htmlVersions` 只属于该文稿，
 * 进入「文稿 1」的工作台时只展示/编辑文稿 1 的子版本。
 */
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
  /** 该文稿自己的 HTML 子版本列表（与其它文稿隔离） */
  htmlVersions?: ArticleHtmlVersion[]
  /** 当前预览/编辑的子版本 id */
  activeHtmlVersionId?: string
}

export type ArticleInput = Pick<Article, 'title' | 'cover' | 'body' | 'notes'>

/** 补齐 cover/body/notes；丢弃历史 content 字段 */
export function migrateArticle(article: Article): Article {
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

  if (!Array.isArray(article.htmlVersions)) {
    article.htmlVersions = []
  }
  if (article.htmlVersions.length && !article.activeHtmlVersionId) {
    article.activeHtmlVersionId = article.htmlVersions[article.htmlVersions.length - 1]?.id
  }

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
  return getArticleHtmlVersions(article).length > 0
}
