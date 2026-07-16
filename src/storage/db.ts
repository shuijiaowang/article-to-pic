import { toRaw } from 'vue'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ArticleAssetRecord } from '@/types/article-asset'
import type { Article } from '@/types/document'

export interface DirectoryHandleRecord {
  articleId: string
  directoryHandle: FileSystemDirectoryHandle
  boundAt: number
}

export interface AppMeta {
  activeArticleId: string | null
  schemaVersion: number
}

interface AppDB extends DBSchema {
  articles: {
    key: string
    value: Article
  }
  assets: {
    key: string
    value: ArticleAssetRecord
    indexes: { 'by-article': string }
  }
  handles: {
    key: string
    value: DirectoryHandleRecord
  }
  meta: {
    key: string
    value: AppMeta | Record<string, unknown>
  }
}

const DB_NAME = 'article-to-pic'
const DB_VERSION = 1
const META_KEY = 'app'

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null

const blobUrlCache = new Map<string, string>()

/** IndexedDB 不能存 Vue Proxy；文稿可 JSON 深拷贝 */
function toPlainArticle(article: Article): Article {
  return JSON.parse(JSON.stringify(toRaw(article))) as Article
}

/** 资源含 Blob，不能 JSON；拆成纯字段再 put */
function toPlainAsset(record: ArticleAssetRecord): ArticleAssetRecord {
  const raw = toRaw(record)
  return {
    id: raw.id,
    articleId: raw.articleId,
    blob: raw.blob,
    mime: raw.mime,
    size: raw.size,
    width: raw.width,
    height: raw.height,
    createdAt: raw.createdAt,
    path: raw.path,
  }
}

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<AppDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('articles')) {
          db.createObjectStore('articles', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('assets')) {
          const store = db.createObjectStore('assets', { keyPath: 'id' })
          store.createIndex('by-article', 'articleId')
        }
        if (!db.objectStoreNames.contains('handles')) {
          db.createObjectStore('handles', { keyPath: 'articleId' })
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta')
        }
      },
    })
  }
  return dbPromise
}

export async function getAllArticles(): Promise<Article[]> {
  const db = await getDb()
  return db.getAll('articles')
}

export async function getArticleByIdFromDb(id: string): Promise<Article | undefined> {
  const db = await getDb()
  return db.get('articles', id)
}

export async function putArticle(article: Article): Promise<void> {
  const db = await getDb()
  await db.put('articles', toPlainArticle(article))
}

export async function deleteArticleFromDb(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('articles', id)
}

export async function getAppMeta(): Promise<AppMeta> {
  const db = await getDb()
  const meta = await db.get('meta', META_KEY)
  if (meta && typeof meta === 'object' && 'schemaVersion' in meta) {
    return meta as AppMeta
  }
  return { activeArticleId: null, schemaVersion: 1 }
}

export async function setAppMeta(meta: AppMeta): Promise<void> {
  const db = await getDb()
  await db.put('meta', { ...toRaw(meta) }, META_KEY)
}

export async function saveArticleAsset(
  input: Omit<ArticleAssetRecord, 'createdAt'> & { createdAt?: number },
): Promise<ArticleAssetRecord> {
  const record = toPlainAsset({
    ...input,
    createdAt: input.createdAt ?? Date.now(),
  } as ArticleAssetRecord)
  const db = await getDb()
  await db.put('assets', record)
  revokeAssetBlobUrl(record.id)
  return record
}

export async function getArticleAsset(id: string): Promise<ArticleAssetRecord | undefined> {
  const db = await getDb()
  return db.get('assets', id)
}

export async function getArticleAssetsByArticleId(articleId: string): Promise<ArticleAssetRecord[]> {
  const db = await getDb()
  return db.getAllFromIndex('assets', 'by-article', articleId)
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

export async function getAssetBlobUrl(id: string): Promise<string | null> {
  const cached = blobUrlCache.get(id)
  if (cached) return cached

  const record = await getArticleAsset(id)
  if (!record) return null

  const url = URL.createObjectURL(record.blob)
  blobUrlCache.set(id, url)
  return url
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

export async function saveDirectoryHandle(record: DirectoryHandleRecord): Promise<void> {
  const db = await getDb()
  await db.put('handles', {
    articleId: record.articleId,
    directoryHandle: toRaw(record.directoryHandle),
    boundAt: record.boundAt,
  })
}

export async function getDirectoryHandle(articleId: string): Promise<DirectoryHandleRecord | undefined> {
  const db = await getDb()
  return db.get('handles', articleId)
}

export async function deleteDirectoryHandle(articleId: string): Promise<void> {
  const db = await getDb()
  await db.delete('handles', articleId)
}
