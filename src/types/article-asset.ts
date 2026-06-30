export interface ArticleAssetRecord {
  id: string
  articleId: string
  blob: Blob
  mime: string
  size: number
  width: number
  height: number
  createdAt: number
}

export interface ArticleAssetMeta {
  id: string
  articleId: string
  mime: string
  size: number
  width: number
  height: number
  createdAt: number
}
