import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import type { Article, ArticleInput } from '@/types/document'
import {
  getActiveHtmlVersion,
  getArticleHtmlVersions,
  hasArticleHtml,
  migrateArticleHtml,
} from '@/types/document'

const STORAGE_KEY = 'article-to-pic:articles'
const ACTIVE_ID_KEY = 'article-to-pic:active-article-id'

function loadFromStorage(): Article[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Article[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((article) => migrateArticleHtml(article))
  } catch {
    return []
  }
}

function saveToStorage(articles: Article[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(articles))
}

function loadActiveId(articles: Article[]): string | null {
  try {
    const id = localStorage.getItem(ACTIVE_ID_KEY)
    if (!id) return null
    return articles.some((a) => a.id === id) ? id : null
  } catch {
    return null
  }
}

function saveActiveId(id: string | null) {
  if (id) {
    localStorage.setItem(ACTIVE_ID_KEY, id)
  } else {
    localStorage.removeItem(ACTIVE_ID_KEY)
  }
}

function createId() {
  return crypto.randomUUID()
}

export const useArticlesStore = defineStore('articles', () => {
  const articles = ref<Article[]>(loadFromStorage())
  const activeId = ref<string | null>(loadActiveId(articles.value))

  watch(activeId, saveActiveId)

  const activeArticle = computed(() => articles.value.find((a) => a.id === activeId.value) ?? null)

  const sortedArticles = computed(() =>
    [...articles.value].sort((a, b) => b.updatedAt - a.updatedAt),
  )

  function persist() {
    saveToStorage(articles.value)
  }

  function createArticle(input: Partial<ArticleInput> = {}) {
    const now = Date.now()
    const article: Article = {
      id: createId(),
      title: input.title?.trim() || '未命名文稿',
      content: input.content ?? '',
      createdAt: now,
      updatedAt: now,
    }
    articles.value.unshift(article)
    activeId.value = article.id
    persist()
    return article
  }

  function updateArticle(id: string, input: ArticleInput) {
    const article = articles.value.find((a) => a.id === id)
    if (!article) return null

    article.title = input.title.trim() || '未命名文稿'
    article.content = input.content
    article.updatedAt = Date.now()
    persist()
    return article
  }

  function deleteArticle(id: string) {
    const index = articles.value.findIndex((a) => a.id === id)
    if (index === -1) return false

    articles.value.splice(index, 1)
    if (activeId.value === id) {
      activeId.value = articles.value[0]?.id ?? null
    }
    persist()
    return true
  }

  function selectArticle(id: string | null) {
    activeId.value = id
  }

  /** 新增一条 HTML 版本并设为当前预览版本 */
  function addArticleHtmlVersion(
    id: string,
    html: string,
    meta: { summary?: string; label?: string } = {},
  ) {
    const article = articles.value.find((a) => a.id === id)
    if (!article) return null

    if (!article.htmlVersions) article.htmlVersions = []

    const version = {
      id: createId(),
      html,
      createdAt: Date.now(),
      summary: meta.summary,
      label: meta.label ?? `版本 ${article.htmlVersions.length + 1}`,
    }
    article.htmlVersions.push(version)
    article.activeHtmlVersionId = version.id
    article.updatedAt = Date.now()
    persist()
    return version
  }

  /** 更新指定 HTML 版本（预览页编辑时用） */
  function updateArticleHtmlVersion(
    articleId: string,
    versionId: string,
    html: string,
    meta: { summary?: string } = {},
  ) {
    const article = articles.value.find((a) => a.id === articleId)
    if (!article?.htmlVersions) return null

    const version = article.htmlVersions.find((v) => v.id === versionId)
    if (!version) return null

    version.html = html
    if (meta.summary !== undefined) version.summary = meta.summary
    article.updatedAt = Date.now()
    persist()
    return version
  }

  function selectHtmlVersion(articleId: string, versionId: string) {
    const article = articles.value.find((a) => a.id === articleId)
    if (!article?.htmlVersions?.some((v) => v.id === versionId)) return false

    article.activeHtmlVersionId = versionId
    persist()
    return true
  }

  function deleteHtmlVersion(articleId: string, versionId: string) {
    const article = articles.value.find((a) => a.id === articleId)
    if (!article?.htmlVersions?.length) return false

    const index = article.htmlVersions.findIndex((v) => v.id === versionId)
    if (index === -1) return false

    article.htmlVersions.splice(index, 1)
    if (article.activeHtmlVersionId === versionId) {
      article.activeHtmlVersionId = article.htmlVersions.at(-1)?.id
    }
    persist()
    return true
  }

  /** @deprecated 请使用 addArticleHtmlVersion / updateArticleHtmlVersion */
  function updateArticleHtml(
    id: string,
    html: string,
    meta: { summary?: string } = {},
  ) {
    const article = articles.value.find((a) => a.id === id)
    if (!article) return null

    const active = getActiveHtmlVersion(article)
    if (active) {
      return updateArticleHtmlVersion(id, active.id, html, meta)
    }
    return addArticleHtmlVersion(id, html, meta)
  }

  function getArticleById(id: string) {
    return articles.value.find((a) => a.id === id) ?? null
  }

  return {
    articles,
    activeId,
    activeArticle,
    sortedArticles,
    createArticle,
    updateArticle,
    addArticleHtmlVersion,
    updateArticleHtmlVersion,
    selectHtmlVersion,
    deleteHtmlVersion,
    updateArticleHtml,
    getArticleById,
    deleteArticle,
    selectArticle,
    getActiveHtmlVersion,
    getArticleHtmlVersions,
    hasArticleHtml,
  }
})
