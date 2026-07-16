export interface ArticleAssetRecord {
  id: string
  articleId: string
  blob: Blob
  mime: string
  size: number
  width: number
  height: number
  createdAt: number
  /** 相对 assets/ 的文件名，用于工作包导出 */
  path?: string
}

export interface ArticleAssetMeta {
  id: string
  articleId: string
  mime: string
  size: number
  width: number
  height: number
  createdAt: number
  path?: string
}
