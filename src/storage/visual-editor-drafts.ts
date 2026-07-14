/** VisualHtmlEditor 草稿持久化（宿主适配器，见 visual-html-editor README） */

const STORAGE_KEY = 'article-to-pic:vhe-drafts-v1'

export interface VisualEditorDraftState {
  versions: unknown[]
  activeVersionId: number
  nextVersionId: number
  [key: string]: unknown
}

export interface VisualEditorDraftEntry {
  scope: string
  refId: string
  label: string
  createdAt: number
  updatedAt: number
  state: VisualEditorDraftState
}

interface DraftStore {
  version: 1
  entries: Record<string, VisualEditorDraftEntry>
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

/** persistKey: `article:${articleId}:${versionId}` */
export function buildArticleVisualEditorPersistKey(articleId: string, versionId: string): string {
  return `article:${articleId}:${versionId}`
}

export function parseArticleVisualEditorPersistKey(
  key: string,
): { articleId: string; versionId: string } | null {
  const match = /^article:([^:]+):(.+)$/.exec(key.trim())
  if (!match) return null
  return { articleId: match[1], versionId: match[2] }
}

export const visualEditorDraftPersistence = {
  load(key: string): VisualEditorDraftState | null {
    const entry = loadStore().entries[key]
    return entry?.state?.versions?.length ? entry.state : null
  },

  save(key: string, state: VisualEditorDraftState, meta: { label?: string } = {}) {
    if (!state?.versions?.length) return
    const store = loadStore()
    const prev = store.entries[key]
    const parsed = parseArticleVisualEditorPersistKey(key)
    const now = Date.now()
    store.entries[key] = {
      scope: 'article',
      refId: parsed ? `${parsed.articleId}:${parsed.versionId}` : key,
      label: meta.label?.trim() || prev?.label || key,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      state,
    }
    saveStore(store)
  },

  remove(key: string) {
    const store = loadStore()
    if (!(key in store.entries)) return
    delete store.entries[key]
    saveStore(store)
  },
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
  visualEditorDraftPersistence.remove(buildArticleVisualEditorPersistKey(articleId, versionId))
}
