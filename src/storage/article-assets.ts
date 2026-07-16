export {
  saveArticleAsset,
  getArticleAsset,
  getArticleAssetsByArticleId,
  getAssetBlobUrl,
  deleteArticleAssetsByArticleId,
  revokeAssetBlobUrl,
  revokeAllAssetBlobUrls,
} from '@/storage/db'

export type { ArticleAssetMeta } from '@/types/article-asset'

import { getArticleAsset } from '@/storage/db'
import type { ArticleAssetMeta } from '@/types/article-asset'

export async function getArticleAssetMeta(id: string): Promise<ArticleAssetMeta | undefined> {
  const record = await getArticleAsset(id)
  if (!record) return undefined
  const { blob: _blob, ...meta } = record
  return meta
}
