export interface Article {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

export type ArticleInput = Pick<Article, 'title' | 'content'>
