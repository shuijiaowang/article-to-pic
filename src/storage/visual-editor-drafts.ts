/** 清理旧版可视化编辑草稿（localStorage）；当前工作台已不再写入草稿 */

const STORAGE_KEY = 'article-to-pic:vhe-drafts-v1'

interface DraftStore {
  version: 1
  entries: Record<string, unknown>
}

function loadStore(): DraftStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { version: 1, entries: {} }
    const parsed = JSON.parse(raw) as DraftStore
    if (!parsed || parsed.version !== 1 || typeof parsed.entries !== 'object') {
      return { version: 1, entries: {} }
    }
    return parsed
  } catch {
    return { version: 1, entries: {} }
  }
}

function saveStore(store: DraftStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function buildPersistKey(articleId: string, versionId: string): string {
  return `article:${articleId}:${versionId}`
}

/** 删除某文稿下全部可视化编辑草稿 */
export function clearVisualEditorDraftsForArticle(articleId: string) {
  const store = loadStore()
  const prefix = `article:${articleId}:`
  let changed = false
  for (const key of Object.keys(store.entries)) {
    if (key.startsWith(prefix)) {
      delete store.entries[key]
      changed = true
    }
  }
  if (changed) saveStore(store)
}

/** 删除某一 HTML 版本对应的编辑草稿 */
export function clearVisualEditorDraftForVersion(articleId: string, versionId: string) {
  const store = loadStore()
  const key = buildPersistKey(articleId, versionId)
  if (!(key in store.entries)) return
  delete store.entries[key]
  saveStore(store)
}
