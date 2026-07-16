import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  deleteArticleAssetsByArticleId,
  deleteArticleFromDb,
  getAllArticles,
  getAppMeta,
  putArticle,
  setAppMeta,
} from '@/storage/db'
import { unbindWorkPackage } from '@/work-package'
import type { Article, ArticleHtmlVersion, ArticleInput } from '@/types/document'
import {
  getActiveHtmlVersion,
  getArticleHtmlVersions,
  hasArticleHtml,
  migrateArticle,
} from '@/types/document'

function createId() {
  return crypto.randomUUID()
}

export const useArticlesStore = defineStore('articles', () => {
  const articles = ref<Article[]>([])
  const activeId = ref<string | null>(null)
  const ready = ref(false)
  const initError = ref<string | null>(null)

  let initPromise: Promise<void> | null = null

  async function init() {
    if (ready.value) return
    if (initPromise) return initPromise

    initPromise = (async () => {
      try {
        const loaded = (await getAllArticles()).map((article) => migrateArticle(article))
        articles.value = loaded

        const meta = await getAppMeta()
        activeId.value =
          meta.activeArticleId && articles.value.some((a) => a.id === meta.activeArticleId)
            ? meta.activeArticleId
            : (articles.value[0]?.id ?? null)
        initError.value = null
      } catch (error) {
        initError.value = error instanceof Error ? error.message : String(error)
        articles.value = []
        activeId.value = null
      } finally {
        ready.value = true
      }
    })()

    return initPromise
  }

  watch(activeId, async (id) => {
    if (!ready.value) return
    await setAppMeta({ activeArticleId: id, schemaVersion: 1 })
  })

  const activeArticle = computed(() => articles.value.find((a) => a.id === activeId.value) ?? null)

  const sortedArticles = computed(() =>
    [...articles.value].sort((a, b) => b.updatedAt - a.updatedAt),
  )

  async function persistArticle(article: Article) {
    await putArticle(article)
  }

  function upsertInMemory(article: Article) {
    const index = articles.value.findIndex((a) => a.id === article.id)
    if (index === -1) {
      articles.value.unshift(article)
    } else {
      articles.value[index] = article
    }
  }

  async function createArticle(input: Partial<ArticleInput> = {}) {
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
    await persistArticle(article)
    return article
  }

  async function updateArticle(id: string, input: ArticleInput) {
    const article = articles.value.find((a) => a.id === id)
    if (!article) return null

    article.title = input.title.trim() || '未命名文稿'
    article.cover = input.cover
    article.body = input.body
    article.notes = input.notes
    article.updatedAt = Date.now()
    await persistArticle(article)
    return article
  }

  async function replaceArticle(article: Article) {
    const migrated = migrateArticle({ ...article })
    upsertInMemory(migrated)
    await persistArticle(migrated)
    return migrated
  }

  async function deleteArticle(id: string) {
    const index = articles.value.findIndex((a) => a.id === id)
    if (index === -1) return false

    articles.value.splice(index, 1)
    if (activeId.value === id) {
      activeId.value = articles.value[0]?.id ?? null
    }
    await deleteArticleFromDb(id)
    await deleteArticleAssetsByArticleId(id)
    await unbindWorkPackage(id)
    return true
  }

  function selectArticle(id: string | null) {
    activeId.value = id
  }

  async function addArticleHtmlVersion(
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
    await persistArticle(article)
    return version
  }

  async function replaceArticleHtmlVersions(
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
    await persistArticle(article)
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
    ready,
    initError,
    init,
    createArticle,
    updateArticle,
    replaceArticle,
    addArticleHtmlVersion,
    replaceArticleHtmlVersions,
    getArticleById,
    deleteArticle,
    selectArticle,
    getActiveHtmlVersion,
    getArticleHtmlVersions,
    hasArticleHtml,
  }
})
