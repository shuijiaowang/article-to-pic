export interface Article {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
  /** AI 生成的完整 HTML（含 head/style/toolbar） */
  generatedHtml?: string
  htmlGeneratedAt?: number
  htmlSummary?: string
}

export type ArticleInput = Pick<Article, 'title' | 'content'>
