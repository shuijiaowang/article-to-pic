<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { isAiReady } from '@/ai'
import { DeepSeekConfigDialog } from '@/html-ai-assistant'
import { generateHtmlFromArticle } from '@/services/ai-html'
import { useToast } from '@/composables/useToast'
import { useArticlesStore } from '@/stores/articles'
import ArticleRichEditor from '@/components/ArticleRichEditor.vue'
import { getArticleHtmlVersions } from '@/types/document'
import { articleToMarkdown, markdownToArticle } from '@/utils/article-md'

const store = useArticlesStore()
const router = useRouter()
const { showToast } = useToast()

const draftTitle = ref('')
const draftCover = ref('')
const draftBody = ref('')
const draftNotes = ref('')
const dirty = ref(false)
const generating = ref(false)
const uploadingHtml = ref(false)
const transferringMd = ref(false)
const generateError = ref('')
const configDialogOpen = ref(false)
const htmlFileInputRef = ref<HTMLInputElement | null>(null)

const hasSelection = computed(() => !!store.activeArticle)

function draftInput() {
  return {
    title: draftTitle.value,
    cover: draftCover.value,
    body: draftBody.value,
    notes: draftNotes.value,
  }
}

function syncDraftFromStore() {
  const article = store.activeArticle
  draftTitle.value = article?.title ?? ''
  draftCover.value = article?.cover ?? ''
  draftBody.value = article?.body ?? ''
  draftNotes.value = article?.notes ?? ''
  dirty.value = false
  generateError.value = ''
}

watch(() => store.activeId, syncDraftFromStore, { immediate: true })

function onInput() {
  dirty.value = true
}

function handleCreate() {
  store.createArticle()
  syncDraftFromStore()
}

function handleLoadSample() {
  store.addSampleArticle()
  syncDraftFromStore()
}

function handleSelect(id: string) {
  if (dirty.value && !confirm('当前文稿有未保存修改，确定切换？')) return
  store.selectArticle(id)
}

function handleSave() {
  if (!store.activeId) return
  store.updateArticle(store.activeId, draftInput())
  dirty.value = false
}

function handleDelete() {
  if (!store.activeId || !store.activeArticle) return
  if (!confirm(`确定删除「${store.activeArticle.title}」？`)) return
  store.deleteArticle(store.activeId)
  syncDraftFromStore()
}

async function handleCopyExportMd() {
  if (!hasSelection.value || transferringMd.value) return

  transferringMd.value = true
  generateError.value = ''
  try {
    const md = articleToMarkdown(draftInput())
    await navigator.clipboard.writeText(md)
    showToast('success', '已复制 Markdown 到剪贴板')
  } catch (error) {
    generateError.value = error instanceof Error ? error.message : '复制导出失败'
    showToast('error', '复制导出失败')
  } finally {
    transferringMd.value = false
  }
}

async function handlePasteImportMd() {
  if (transferringMd.value) return

  if (hasSelection.value && dirty.value) {
    if (!confirm('当前文稿有未保存修改，导入将覆盖编辑区内容，是否继续？')) return
  } else if (hasSelection.value) {
    if (!confirm('导入将覆盖当前文稿的标题与三区内容，是否继续？')) return
  }

  transferringMd.value = true
  generateError.value = ''
  try {
    const text = await navigator.clipboard.readText()
    const parsed = markdownToArticle(text)

    if (!store.activeId) {
      store.createArticle(parsed)
      syncDraftFromStore()
    } else {
      draftTitle.value = parsed.title
      draftCover.value = parsed.cover
      draftBody.value = parsed.body
      draftNotes.value = parsed.notes
      store.updateArticle(store.activeId, parsed)
      dirty.value = false
    }

    showToast('success', '已从剪贴板导入 Markdown')
  } catch (error) {
    generateError.value = error instanceof Error ? error.message : '粘贴导入失败'
    showToast('error', generateError.value)
  } finally {
    transferringMd.value = false
  }
}

async function handleGenerateHtml() {
  if (!store.activeId || generating.value) return

  if (dirty.value) {
    store.updateArticle(store.activeId, draftInput())
    dirty.value = false
  }

  if (!isAiReady()) {
    configDialogOpen.value = true
    return
  }

  const article = store.activeArticle
  if (!article) return

  generating.value = true
  generateError.value = ''

  try {
    const result = await generateHtmlFromArticle(draftInput())

    store.addArticleHtmlVersion(store.activeId, result.content, { summary: result.summary })
    router.push({ name: 'html-preview', params: { id: store.activeId } })
  } catch (error) {
    generateError.value = error instanceof Error ? error.message : String(error)
  } finally {
    generating.value = false
  }
}

function handleViewHtml() {
  if (!store.activeId) return
  router.push({ name: 'html-preview', params: { id: store.activeId } })
}

function isHtmlFile(file: File) {
  const name = (file.name || '').toLowerCase()
  return name.endsWith('.html') || name.endsWith('.htm') || file.type === 'text/html'
}

function triggerUploadHtml() {
  htmlFileInputRef.value?.click()
}

async function handleUploadHtmlChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || uploadingHtml.value || generating.value) return

  if (!isHtmlFile(file)) {
    generateError.value = '请选择 .html 或 .htm 文件'
    return
  }

  uploadingHtml.value = true
  generateError.value = ''

  try {
    const html = await file.text()
    if (!html.trim()) {
      throw new Error('HTML 文件为空')
    }

    const baseName = file.name.replace(/\.(html?|htm)$/i, '') || '未命名文稿'
    let articleId = store.activeId

    if (!articleId) {
      const article = store.createArticle({ title: baseName })
      articleId = article.id
      syncDraftFromStore()
    } else if (dirty.value) {
      store.updateArticle(articleId, draftInput())
      dirty.value = false
    }

    store.addArticleHtmlVersion(articleId, html, {
      label: `上传 · ${baseName}`,
      summary: `从本地文件「${file.name}」导入`,
    })
    router.push({ name: 'html-preview', params: { id: articleId } })
  } catch (error) {
    generateError.value = error instanceof Error ? error.message : String(error)
  } finally {
    uploadingHtml.value = false
  }
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="docs-page">
    <header class="docs-header">
      <h1>文稿管理</h1>
      <span v-if="dirty" class="docs-dirty">未保存</span>
      <div class="docs-header-actions">
        <button type="button" class="docs-btn primary" @click="handleCreate">新建文稿</button>
        <button type="button" class="docs-btn" :disabled="!hasSelection || !dirty" @click="handleSave">
          保存
        </button>
        <button
          type="button"
          class="docs-btn"
          :disabled="!hasSelection || transferringMd"
          @click="handleCopyExportMd"
        >
          复制导出
        </button>
        <button
          type="button"
          class="docs-btn"
          :disabled="transferringMd"
          @click="handlePasteImportMd"
        >
          粘贴导入
        </button>
        <button
          type="button"
          class="docs-btn accent"
          :disabled="!hasSelection || generating || uploadingHtml"
          @click="handleGenerateHtml"
        >
          {{ generating ? '生成中…' : '生成 HTML' }}
        </button>
        <button
          type="button"
          class="docs-btn"
          :disabled="generating || uploadingHtml"
          @click="triggerUploadHtml"
        >
          {{ uploadingHtml ? '上传中…' : '上传 HTML' }}
        </button>
        <input
          ref="htmlFileInputRef"
          type="file"
          accept=".html,.htm,text/html"
          hidden
          @change="handleUploadHtmlChange"
        />
        <button
          type="button"
          class="docs-btn"
          :disabled="!hasSelection"
          @click="handleViewHtml"
        >
          HTML 工作台
        </button>
        <button type="button" class="docs-btn danger" :disabled="!hasSelection" @click="handleDelete">
          删除
        </button>
      </div>
    </header>
    <p v-if="generateError" class="docs-error">{{ generateError }}</p>

    <div class="docs-body">
      <aside class="docs-sidebar">
        <div v-if="store.sortedArticles.length === 0" class="docs-empty-list">
          暂无文稿，点击「新建文稿」开始，或加载示例文稿体验
          <button type="button" class="docs-btn primary docs-empty-btn" @click="handleLoadSample">
            加载示例文稿
          </button>
        </div>
        <ul v-else class="docs-list">
          <li
            v-for="article in store.sortedArticles"
            :key="article.id"
            class="docs-item"
            :class="{ active: article.id === store.activeId }"
            @click="handleSelect(article.id)"
          >
            <span class="docs-item-title">
              {{ article.title }}
              <span v-if="store.hasArticleHtml(article)" class="docs-item-badge">
                HTML{{ getArticleHtmlVersions(article).length > 1 ? ` ×${getArticleHtmlVersions(article).length}` : '' }}
              </span>
            </span>
            <span class="docs-item-meta">{{ formatTime(article.updatedAt) }}</span>
          </li>
        </ul>
      </aside>

      <main class="docs-editor">
        <template v-if="hasSelection">
          <input
            v-model="draftTitle"
            class="docs-title-input"
            type="text"
            placeholder="文稿标题"
            @input="onInput"
          />

          <section class="docs-section">
            <header class="docs-section-head">
              <h2>封面区</h2>
              <p>只描述封面需求，例如主标题、副标题、标签、氛围等</p>
            </header>
            <ArticleRichEditor
              v-model="draftCover"
              compact
              :article-id="store.activeId ?? undefined"
              placeholder="描述封面需要什么…"
              @input="onInput"
            />
          </section>

          <section class="docs-section docs-section--body">
            <header class="docs-section-head">
              <h2>正文区</h2>
              <p>按阅读顺序写正文内容</p>
            </header>
            <ArticleRichEditor
              v-model="draftBody"
              :article-id="store.activeId ?? undefined"
              placeholder="在此输入正文…"
              @input="onInput"
            />
          </section>

          <section class="docs-section">
            <header class="docs-section-head">
              <h2>备注区</h2>
              <p>大方向、配色、结构、分页等全局要求</p>
            </header>
            <ArticleRichEditor
              v-model="draftNotes"
              compact
              :article-id="store.activeId ?? undefined"
              placeholder="写配色、结构、分页要求等…"
              @input="onInput"
            />
          </section>
        </template>
        <div v-else class="docs-editor-empty">
          <p>选择左侧文稿进行编辑，或新建一篇</p>
          <div class="docs-editor-empty-actions">
            <button type="button" class="docs-btn primary" @click="handleCreate">新建文稿</button>
            <button type="button" class="docs-btn" @click="handleLoadSample">加载示例文稿</button>
          </div>
        </div>
      </main>
    </div>

    <DeepSeekConfigDialog v-model="configDialogOpen" />
  </div>
</template>

<style scoped>
.docs-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: #f5f5f7;
  color: #1a1a1a;
}

.docs-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e5e5ea;
  flex-shrink: 0;
}

.docs-header h1 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.docs-dirty {
  font-size: 12px;
  color: #d97706;
}

.docs-header-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.docs-btn {
  padding: 7px 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  color: #333;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.docs-btn:hover:not(:disabled) {
  background: #f5f5f5;
}

.docs-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.docs-btn.primary {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}

.docs-btn.primary:hover:not(:disabled) {
  background: #6d28d9;
}

.docs-btn.accent {
  background: #0ea5e9;
  border-color: #0ea5e9;
  color: #fff;
}

.docs-btn.accent:hover:not(:disabled) {
  background: #0284c7;
}

.docs-error {
  margin: 0;
  padding: 8px 20px;
  font-size: 13px;
  color: #dc2626;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
}

.docs-btn.danger {
  color: #dc2626;
  border-color: #fecaca;
}

.docs-btn.danger:hover:not(:disabled) {
  background: #fef2f2;
}

.docs-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.docs-sidebar {
  width: 280px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e5e5ea;
  overflow-y: auto;
}

.docs-empty-list {
  padding: 24px 16px;
  color: #888;
  font-size: 13px;
  line-height: 1.6;
}

.docs-empty-btn {
  display: block;
  margin-top: 12px;
  width: 100%;
}

.docs-list {
  list-style: none;
  margin: 0;
  padding: 8px;
}

.docs-item {
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
}

.docs-item:hover {
  background: #f5f5f7;
}

.docs-item.active {
  background: #ede9fe;
}

.docs-item-title {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs-item-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  color: #0ea5e9;
  background: #e0f2fe;
  border-radius: 4px;
  vertical-align: middle;
}

.docs-item-meta {
  font-size: 12px;
  color: #888;
}

.docs-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 20px 24px;
  gap: 16px;
  overflow-y: auto;
}

.docs-title-input {
  width: 100%;
  flex-shrink: 0;
  padding: 12px 14px;
  border: 1px solid #e5e5ea;
  border-radius: 8px;
  background: #fff;
  font: inherit;
  font-size: 20px;
  font-weight: 600;
}

.docs-title-input:focus {
  outline: none;
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.12);
}

.docs-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.docs-section--body {
  flex: 1 0 auto;
  min-height: 420px;
}

.docs-section--body :deep(.article-rich-editor) {
  flex: none;
  min-height: 420px;
  height: auto;
}

.docs-section-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.docs-section-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
}

.docs-section-head p {
  margin: 0;
  font-size: 12px;
  color: #888;
}

.docs-editor-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #888;
  font-size: 14px;
}

.docs-editor-empty-actions {
  display: flex;
  gap: 8px;
}
</style>
