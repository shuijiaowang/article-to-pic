import type { Article, ArticleHtmlVersion } from '@/types/document'
import { getArticleHtmlVersions, getActiveHtmlVersion } from '@/types/document'

/** 编辑器 persistence 形状：与 ArticleHtmlVersion 对齐，另附会话级撤销栈（不落盘） */
export interface VheVersionEntryState {
  id: string
  html: string
  createdAt: number
  label?: string
  summary?: string
  historyPast?: unknown[]
  historyCurrent?: unknown | null
  historyFuture?: unknown[]
  baselineBodyHtml?: string
}

export interface VheVersionState {
  versions: VheVersionEntryState[]
  activeVersionId: string
}

function stripHistory(entry: VheVersionEntryState): ArticleHtmlVersion {
  return {
    id: entry.id,
    html: String(entry.html ?? ''),
    createdAt: Number(entry.createdAt) || Date.now(),
    label: entry.label,
    summary: entry.summary,
  }
}

/** 文章 → 编辑器挂载态（补空撤销栈） */
export function articleToVheState(article: Article | null | undefined): VheVersionState | null {
  const list = getArticleHtmlVersions(article)
  if (!list.length) return null

  const versions: VheVersionEntryState[] = list.map((item) => ({
    id: item.id,
    html: item.html,
    createdAt: item.createdAt,
    label: item.label,
    summary: item.summary,
    historyPast: [],
    historyCurrent: null,
    historyFuture: [],
    baselineBodyHtml: '',
  }))

  const active = getActiveHtmlVersion(article)
  const fallback = versions[versions.length - 1]
  if (!fallback) return null

  return {
    versions,
    activeVersionId: active?.id ?? fallback.id,
  }
}

/** 编辑器导出 → 文章落盘（去掉撤销栈） */
export function vheStateToArticleVersions(
  state: VheVersionState | null | undefined,
): { versions: ArticleHtmlVersion[]; activeHtmlVersionId: string } | null {
  const list = Array.isArray(state?.versions) ? state.versions : []
  if (!list.length) return null

  const versions = list.map(stripHistory)
  const last = versions[versions.length - 1]
  if (!last) return null

  const activeId = String(state?.activeVersionId || '').trim()
  const activeHtmlVersionId = versions.some((v) => v.id === activeId)
    ? activeId
    : last.id

  return { versions, activeHtmlVersionId }
}
