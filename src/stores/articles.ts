import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { deleteArticleAssetsByArticleId } from '@/storage/article-assets'
import { SAMPLE_ARTICLE, SAMPLE_ARTICLE_ID } from '@/data/sample-article'
import type { Article, ArticleHtmlVersion, ArticleInput } from '@/types/document'
import {
  getActiveHtmlVersion,
  getArticleHtmlVersions,
  hasArticleHtml,
  migrateArticle,
} from '@/types/document'

const STORAGE_KEY = 'article-to-pic:articles'
const ACTIVE_ID_KEY = 'article-to-pic:active-article-id'

function createSampleArticle(): Article {
  const now = Date.now()
  return {
    id: SAMPLE_ARTICLE_ID,
    title: SAMPLE_ARTICLE.title,
    cover: SAMPLE_ARTICLE.cover,
    body: SAMPLE_ARTICLE.body,
    notes: SAMPLE_ARTICLE.notes,
    createdAt: now,
    updatedAt: now,
    htmlVersions: [],
  }
}

function loadFromStorage(): Article[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const sample = createSampleArticle()
      saveToStorage([sample])
      return [sample]
    }
    const parsed = JSON.parse(raw) as Article[]
    if (!Array.isArray(parsed)) return []
    const migrated = parsed.map((article) => migrateArticle(article))
    saveToStorage(migrated)
    return migrated
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
  const activeId = ref<string | null>(
    loadActiveId(articles.value) ?? articles.value[0]?.id ?? null,
  )

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
      cover: input.cover ?? '',
      body: input.body ?? '',
      notes: input.notes ?? '',
      createdAt: now,
      updatedAt: now,
      htmlVersions: [],
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
    article.cover = input.cover
    article.body = input.body
    article.notes = input.notes
    article.updatedAt = Date.now()
    persist()
    return article
  }

  async function deleteArticle(id: string) {
    const index = articles.value.findIndex((a) => a.id === id)
    if (index === -1) return false

    articles.value.splice(index, 1)
    if (activeId.value === id) {
      activeId.value = articles.value[0]?.id ?? null
    }
    persist()
    await deleteArticleAssetsByArticleId(id)
    return true
  }

  function selectArticle(id: string | null) {
    activeId.value = id
  }

  /** 添加或选中内置示例文稿 */
  function addSampleArticle() {
    const existing = articles.value.find((a) => a.id === SAMPLE_ARTICLE_ID)
    if (existing) {
      activeId.value = existing.id
      return existing
    }
    const sample = createSampleArticle()
    articles.value.unshift(sample)
    activeId.value = sample.id
    persist()
    return sample
  }

  /** 新增一条 HTML 版本并设为当前预览版本（文稿管理页生成 / 上传用） */
  function addArticleHtmlVersion(
    id: string,
    html: string,
    meta: { summary?: string; label?: string } = {},
  ) {
    const article = articles.value.find((a) => a.id === id)
    if (!article) return null

    if (!article.htmlVersions) article.htmlVersions = []

    const version: ArticleHtmlVersion = {
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

  /** 用编辑器导出的完整版本列表整体替换 */
  function replaceArticleHtmlVersions(
    articleId: string,
    versions: ArticleHtmlVersion[],
    activeHtmlVersionId?: string,
  ) {
    const article = articles.value.find((a) => a.id === articleId)
    if (!article) return null
    if (!versions.length) return null

    article.htmlVersions = versions.map((v) => ({ ...v }))
    article.activeHtmlVersionId = versions.some((v) => v.id === activeHtmlVersionId)
      ? activeHtmlVersionId
      : versions[versions.length - 1]?.id
    article.updatedAt = Date.now()
    persist()
    return article
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
    replaceArticleHtmlVersions,
    getArticleById,
    deleteArticle,
    selectArticle,
    addSampleArticle,
    getActiveHtmlVersion,
    getArticleHtmlVersions,
    hasArticleHtml,
  }
})
