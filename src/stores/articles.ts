import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { Article, ArticleInput } from '@/types/document'

const STORAGE_KEY = 'article-to-pic:articles'

function loadFromStorage(): Article[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Article[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveToStorage(articles: Article[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(articles))
}

function createId() {
  return crypto.randomUUID()
}

export const useArticlesStore = defineStore('articles', () => {
  const articles = ref<Article[]>(loadFromStorage())
  const activeId = ref<string | null>(null)

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

  return {
    articles,
    activeId,
    activeArticle,
    sortedArticles,
    createArticle,
    updateArticle,
    deleteArticle,
    selectArticle,
  }
})
