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
import {
  createAndBindWorkPackageFolder,
  openWorkPackageFolder,
  pullWorkPackageFromFolder,
  pushWorkPackageToFolder,
  unbindWorkPackage,
} from '@/work-package'
import { isDirectoryPickerSupported } from '@/work-package/permission'
import { isArticleBound } from '@/work-package/handles'

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
const workPackageBusy = ref(false)
const folderBound = ref(false)
const generateError = ref('')
const configDialogOpen = ref(false)
const htmlFileInputRef = ref<HTMLInputElement | null>(null)

const hasSelection = computed(() => !!store.activeArticle)
const folderPickerSupported = isDirectoryPickerSupported()
const canSync = computed(() => folderBound.value && hasSelection.value)

const bindingLabel = computed(() => {
  const binding = store.activeArticle?.binding
  if (!binding?.folderName) return folderBound.value ? '已绑定文件夹' : ''
  const synced = binding.lastSyncedAt
    ? new Date(binding.lastSyncedAt).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '未同步'
  return `${binding.folderName} · ${synced}`
})

async function refreshFolderBound() {
  if (!store.activeId) {
    folderBound.value = false
    return
  }
  folderBound.value = await isArticleBound(store.activeId)
}

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
  void refreshFolderBound()
}

watch(() => store.activeId, syncDraftFromStore, { immediate: true })

function onInput() {
  dirty.value = true
}

function handleSelect(id: string) {
  if (dirty.value && !confirm('当前文稿有未保存修改，确定切换？')) return
  store.selectArticle(id)
}

async function handleDelete() {
  if (!store.activeId || !store.activeArticle) return
  if (!confirm(`从网站移除「${store.activeArticle.title}」？\n本地文件夹不会删除。`)) return
  await store.deleteArticle(store.activeId)
  syncDraftFromStore()
}

/** 打开已有工作包文件夹 */
async function handleOpen() {
  if (workPackageBusy.value) return
  if (!folderPickerSupported) {
    showToast('error', '请使用 Chrome / Edge 打开工作包')
    return
  }
  if (dirty.value && !confirm('当前有未保存修改，打开工作包将放弃，是否继续？')) return

  workPackageBusy.value = true
  generateError.value = ''
  try {
    const result = await openWorkPackageFolder()
    await store.replaceArticle(result.article)
    store.selectArticle(result.article.id)
    syncDraftFromStore()
    showToast(
      'success',
      `已打开，导入 ${result.summary.assetsImported} 张图片${result.summary.htmlImported ? '，含 HTML' : ''}`,
    )
  } catch (error) {
    if (isUserCancel(error)) return
    generateError.value = error instanceof Error ? error.message : String(error)
    showToast('error', generateError.value)
  } finally {
    workPackageBusy.value = false
  }
}

/** 新建 = 选文件夹并创建工作包 */
async function handleNew() {
  if (workPackageBusy.value) return
  if (!folderPickerSupported) {
    showToast('error', '请使用 Chrome / Edge 新建工作包')
    return
  }

  workPackageBusy.value = true
  generateError.value = ''
  try {
    const article = await store.createArticle()
    const result = await createAndBindWorkPackageFolder(article)
    await store.replaceArticle(result.article)
    syncDraftFromStore()
    showToast('success', `已新建：${result.article.binding?.folderName}（含示例文稿与 HTML）`)
  } catch (error) {
    if (isUserCancel(error)) {
      // 用户取消选文件夹时，删掉刚创建的空文稿
      if (store.activeId) await store.deleteArticle(store.activeId)
      syncDraftFromStore()
      return
    }
    generateError.value = error instanceof Error ? error.message : String(error)
    showToast('error', generateError.value)
  } finally {
    workPackageBusy.value = false
  }
}

/** 保存 = 写 IndexedDB + 推送到本地文件夹 */
async function handleSave() {
  if (!store.activeId || !store.activeArticle || workPackageBusy.value) return

  workPackageBusy.value = true
  generateError.value = ''
  try {
    await store.updateArticle(store.activeId, draftInput())
    dirty.value = false

    if (!(await isArticleBound(store.activeId))) {
      showToast('error', '未绑定文件夹，请重新「打开」工作包')
      return
    }

    const result = await pushWorkPackageToFolder(store.activeId)
    await store.replaceArticle(result.article)
    syncDraftFromStore()
    showToast('success', `已保存到本地（${result.filesWritten.length} 个文件）`)
  } catch (error) {
    generateError.value = error instanceof Error ? error.message : String(error)
    showToast('error', generateError.value)
  } finally {
    workPackageBusy.value = false
  }
}

async function handlePullFromLocal() {
  if (!store.activeId || workPackageBusy.value) return
  if (dirty.value && !confirm('从本地更新将覆盖当前编辑区，是否继续？')) return

  workPackageBusy.value = true
  generateError.value = ''
  try {
    const result = await pullWorkPackageFromFolder(store.activeId)
    await store.replaceArticle(result.article)
    syncDraftFromStore()
    const parts: string[] = []
    if (result.summary.mdChanged) parts.push('文稿已更新')
    if (result.summary.htmlChanged) parts.push('HTML 已更新')
    if (result.summary.assetsAdded.length) parts.push(`新增 ${result.summary.assetsAdded.length} 图`)
    if (result.summary.assetsUpdated.length) parts.push(`更新 ${result.summary.assetsUpdated.length} 图`)
    showToast('success', parts.length ? parts.join(' · ') : '本地无变更')
  } catch (error) {
    generateError.value = error instanceof Error ? error.message : String(error)
    showToast('error', generateError.value)
  } finally {
    workPackageBusy.value = false
  }
}

async function handleUnbindFolder() {
  if (!store.activeId || workPackageBusy.value) return
  if (!confirm('解绑后本篇无法再同步本地文件夹，是否继续？')) return

  workPackageBusy.value = true
  try {
    await unbindWorkPackage(store.activeId)
    const article = store.getArticleById(store.activeId)
    if (article) {
      const { binding: _b, ...rest } = article
      await store.replaceArticle(rest)
    }
    syncDraftFromStore()
    showToast('success', '已解绑')
  } catch (error) {
    generateError.value = error instanceof Error ? error.message : String(error)
    showToast('error', generateError.value)
  } finally {
    workPackageBusy.value = false
  }
}

async function handleGenerateHtml() {
  if (!store.activeId || generating.value) return

  if (dirty.value) {
    await store.updateArticle(store.activeId, draftInput())
    dirty.value = false
  }

  if (!isAiReady()) {
    configDialogOpen.value = true
    return
  }

  if (!store.activeArticle) return

  generating.value = true
  generateError.value = ''

  try {
    const result = await generateHtmlFromArticle(draftInput())
    await store.addArticleHtmlVersion(store.activeId, result.content, { summary: result.summary })

    if (await isArticleBound(store.activeId)) {
      try {
        const pushed = await pushWorkPackageToFolder(store.activeId)
        await store.replaceArticle(pushed.article)
      } catch {
        // HTML 已入库；写盘失败不阻断进工作台
      }
    }

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
  if (!store.activeId) {
    showToast('error', '请先打开或新建工作包')
    return
  }
  htmlFileInputRef.value?.click()
}

async function handleUploadHtmlChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || uploadingHtml.value || generating.value || !store.activeId) return

  if (!isHtmlFile(file)) {
    generateError.value = '请选择 .html 或 .htm 文件'
    return
  }

  uploadingHtml.value = true
  generateError.value = ''

  try {
    const html = await file.text()
    if (!html.trim()) throw new Error('HTML 文件为空')

    const baseName = file.name.replace(/\.(html?|htm)$/i, '') || '未命名'
    if (dirty.value) {
      await store.updateArticle(store.activeId, draftInput())
      dirty.value = false
    }

    await store.addArticleHtmlVersion(store.activeId, html, {
      label: `上传 · ${baseName}`,
      summary: `从本地文件「${file.name}」导入`,
    })

    if (await isArticleBound(store.activeId)) {
      try {
        const pushed = await pushWorkPackageToFolder(store.activeId)
        await store.replaceArticle(pushed.article)
      } catch {
        // ignore push failure
      }
    }

    router.push({ name: 'html-preview', params: { id: store.activeId } })
  } catch (error) {
    generateError.value = error instanceof Error ? error.message : String(error)
  } finally {
    uploadingHtml.value = false
  }
}

function isUserCancel(error: unknown) {
  if (!(error instanceof Error)) return false
  const name = error.name || ''
  const msg = error.message || ''
  return name === 'AbortError' || /abort|cancel|取消/i.test(msg)
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
      <h1>工作包</h1>
      <span v-if="dirty" class="docs-dirty">未保存</span>
      <span v-if="bindingLabel" class="docs-binding-inline" :title="bindingLabel">{{ bindingLabel }}</span>
      <div class="docs-header-actions">
        <button
          type="button"
          class="docs-btn primary"
          :disabled="workPackageBusy"
          @click="handleOpen"
        >
          打开
        </button>
        <button
          type="button"
          class="docs-btn"
          :disabled="workPackageBusy"
          @click="handleNew"
        >
          新建
        </button>
        <button
          type="button"
          class="docs-btn"
          :disabled="!canSync || workPackageBusy"
          @click="handleSave"
        >
          保存
        </button>
        <button
          type="button"
          class="docs-btn"
          :disabled="!canSync || workPackageBusy"
          @click="handlePullFromLocal"
        >
          从本地更新
        </button>
        <span class="docs-sep" aria-hidden="true" />
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
          :disabled="!hasSelection || generating || uploadingHtml"
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
        <span class="docs-sep" aria-hidden="true" />
        <button
          type="button"
          class="docs-btn"
          :disabled="!canSync || workPackageBusy"
          @click="handleUnbindFolder"
        >
          解绑
        </button>
        <button type="button" class="docs-btn danger" :disabled="!hasSelection" @click="handleDelete">
          删除
        </button>
      </div>
    </header>

    <p v-if="!folderPickerSupported" class="docs-workpack-hint">
      工作包需要 Chrome / Edge（文件夹访问权限）。
    </p>
    <p v-if="generateError" class="docs-error">{{ generateError }}</p>

    <div class="docs-body">
      <aside class="docs-sidebar">
        <div v-if="store.sortedArticles.length === 0" class="docs-empty-list">
          暂无工作包。点「打开」导入已有文件夹，或「新建」创建空包。
          <button type="button" class="docs-btn primary docs-empty-btn" @click="handleOpen">
            打开工作包
          </button>
          <button type="button" class="docs-btn docs-empty-btn" @click="handleNew">
            新建工作包
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
            <span class="docs-item-meta">
              {{ article.binding?.folderName ? `📁 ${article.binding.folderName}` : '未绑定' }}
              · {{ formatTime(article.updatedAt) }}
            </span>
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
              <p>按阅读顺序写正文内容；配图会写入工作包 assets/</p>
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
          <p>打开已有工作包，或新建一个本地文件夹</p>
          <div class="docs-editor-empty-actions">
            <button type="button" class="docs-btn primary" @click="handleOpen">打开</button>
            <button type="button" class="docs-btn" @click="handleNew">新建</button>
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
  flex-wrap: wrap;
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

.docs-binding-inline {
  font-size: 12px;
  color: #666;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs-header-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.docs-sep {
  width: 1px;
  height: 20px;
  background: #e5e5ea;
  margin: 0 2px;
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

.docs-workpack-hint {
  margin: 0;
  padding: 6px 20px;
  font-size: 12px;
  color: #888;
  background: #fafafa;
  border-bottom: 1px solid #e5e5ea;
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
