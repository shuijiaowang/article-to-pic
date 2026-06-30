import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ArticleAssetMeta, ArticleAssetRecord } from '@/types/article-asset'

interface ArticleAssetsDB extends DBSchema {
  assets: {
    key: string
    value: ArticleAssetRecord
    indexes: { 'by-article': string }
  }
}

const DB_NAME = 'article-to-pic-assets'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<ArticleAssetsDB>> | null = null

const blobUrlCache = new Map<string, string>()

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<ArticleAssetsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('assets', { keyPath: 'id' })
        store.createIndex('by-article', 'articleId')
      },
    })
  }
  return dbPromise
}

export async function saveArticleAsset(
  input: Omit<ArticleAssetRecord, 'createdAt'> & { createdAt?: number },
): Promise<ArticleAssetRecord> {
  const record: ArticleAssetRecord = {
    ...input,
    createdAt: input.createdAt ?? Date.now(),
  }
  const db = await getDb()
  await db.put('assets', record)
  revokeAssetBlobUrl(record.id)
  return record
}

export async function getArticleAsset(id: string): Promise<ArticleAssetRecord | undefined> {
  const db = await getDb()
  return db.get('assets', id)
}

export async function getArticleAssetMeta(id: string): Promise<ArticleAssetMeta | undefined> {
  const record = await getArticleAsset(id)
  if (!record) return undefined
  const { blob: _blob, ...meta } = record
  return meta
}

export async function getAssetBlobUrl(id: string): Promise<string | null> {
  const cached = blobUrlCache.get(id)
  if (cached) return cached

  const record = await getArticleAsset(id)
  if (!record) return null

  const url = URL.createObjectURL(record.blob)
  blobUrlCache.set(id, url)
  return url
}

export async function deleteArticleAssetsByArticleId(articleId: string): Promise<number> {
  const db = await getDb()
  const records = await db.getAllFromIndex('assets', 'by-article', articleId)
  if (records.length === 0) return 0

  const tx = db.transaction('assets', 'readwrite')
  await Promise.all([
    ...records.map((record) => {
      revokeAssetBlobUrl(record.id)
      return tx.store.delete(record.id)
    }),
    tx.done,
  ])
  return records.length
}

export function revokeAssetBlobUrl(id: string) {
  const url = blobUrlCache.get(id)
  if (!url) return
  URL.revokeObjectURL(url)
  blobUrlCache.delete(id)
}

export function revokeAllAssetBlobUrls() {
  for (const url of blobUrlCache.values()) {
    URL.revokeObjectURL(url)
  }
  blobUrlCache.clear()
}
