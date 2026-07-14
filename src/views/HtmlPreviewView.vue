<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useTextToPicPreview } from '@/composables/useTextToPicPreview'
import { HtmlAiAssistant } from '@/html-ai-assistant'
import type { HtmlAiChatHtmlUpdatedPayload } from '@/html-ai-assistant/types'
import { VisualHtmlEditor, type VisualHtmlEditorExpose } from '@/visual-html-editor'
import { useArticlesStore } from '@/stores/articles'
import { getActiveHtmlVersion, getArticleHtmlVersions } from '@/types/document'
import { parseTextToPicHtml } from '@/utils/parse-html'
import { resolveAssetsInHtml, restoreAssetRefsInHtml } from '@/utils/article-asset-html'
import { downloadHtmlFile } from '@/utils/normalize-html'
import { bindPreviewPageLayout, teardownPreviewPageLayout } from '@/utils/texttopic/preview-page-layout'
import templateHtml from '../../template/template.html?raw'

const route = useRoute()
const router = useRouter()
const store = useArticlesStore()

const articleId = computed(() => route.params.id as string)
const article = computed(() => store.getArticleById(articleId.value))
const htmlVersions = computed(() => getArticleHtmlVersions(article.value))
const activeVersion = computed(() => getActiveHtmlVersion(article.value))
const isLearningTemplate = computed(() => !!article.value && !activeVersion.value)

const initialMode = computed<'edit' | 'preview'>(() => {
  const raw = route.query.mode
  return raw === 'edit' ? 'edit' : 'preview'
})

const learningTemplateHtml = computed(() => {
  if (!article.value) return ''
  const safeTitle = article.value.title.trim() || '未命名文稿'
  return templateHtml.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${safeTitle} - 预览模板</title>`,
  )
})
const previewHtml = computed(() => activeVersion.value?.html ?? learningTemplateHtml.value)
const previewSummary = computed(() => {
  if (activeVersion.value?.summary) return activeVersion.value.summary
  if (isLearningTemplate.value) {
    return '当前显示的是学习用预览模板。你可以先熟悉分页和版式，再返回文稿管理点击「生成 HTML」获得正式版本。'
  }
  return ''
})

const fullHtml = shallowRef('')
const frameHtml = ref('')
const previewReady = ref(false)
const parseError = ref('')
const optimizeError = ref('')
const editorDirty = ref(false)
const editorMode = ref<'edit' | 'preview'>(initialMode.value)

const editorRef = ref<VisualHtmlEditorExpose | null>(null)
const docRef = ref<HTMLElement | null>(null)

const previewScopeId = computed(() => `article-preview-${articleId.value}`)
const loadingHtml = ref(false)

const articleFileName = computed(() => {
  const safeName = article.value?.title.replace(/[\\/:*?"<>|]/g, '_') || 'article'
  return `${safeName}.html`
})

const editorMountKey = computed(
  () => `${articleId.value}:${activeVersion.value?.id ?? 'template'}:${frameHtml.value ? 'ready' : 'wait'}`,
)

const showEditor = computed(
  () => !!article.value && !!frameHtml.value && !loadingHtml.value && !parseError.value,
)

const aiHtml = computed(() => {
  const live = editorRef.value?.getHtml?.()
  if (live?.trim()) return restoreAssetRefsInHtml(live)
  return fullHtml.value
})

const {
  status,
  statusWarn,
  showReport,
  reportText,
  exporting,
  showLayoutReport,
  copyReport,
  exportAll,
  closeReport,
} = useTextToPicPreview({
  docRef,
})

function handleAiStatus(message: string, warn = false) {
  status.value = message
  statusWarn.value = warn
}

function handleAiError(message: string) {
  optimizeError.value = message
}

function handleAiHtmlUpdated(payload: HtmlAiChatHtmlUpdatedPayload) {
  store.addArticleHtmlVersion(articleId.value, payload.content, {
    summary: payload.summary,
    label: payload.label,
  })
}

async function loadFromHtml(html: string) {
  parseError.value = ''
  previewReady.value = false
  docRef.value = null
  loadingHtml.value = true
  try {
    parseTextToPicHtml(html)
    fullHtml.value = html
    frameHtml.value = await resolveAssetsInHtml(html)
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : String(error)
    fullHtml.value = ''
    frameHtml.value = ''
  } finally {
    loadingHtml.value = false
  }
}

function handleEditorFrameLoad(doc: Document) {
  bindPreviewPageLayout(doc)
  const docRoot = doc.getElementById('doc')
  docRef.value = docRoot
  previewReady.value = !!docRoot
  if (!docRoot) {
    parseError.value = '未找到 #doc，请确认是 TextToPic 模板 HTML'
  }
}

function handleModeChange(mode: 'edit' | 'preview') {
  editorMode.value = mode
  const nextQuery = { ...route.query }
  if (mode === 'edit') nextQuery.mode = 'edit'
  else delete nextQuery.mode
  router.replace({ query: nextQuery })
}

watch(
  previewHtml,
  (html) => {
    if (html) void loadFromHtml(html)
    else {
      fullHtml.value = ''
      frameHtml.value = ''
      previewReady.value = false
      docRef.value = null
    }
  },
  { immediate: true },
)

watch(
  () => article.value,
  (value) => {
    if (!value) return
    store.selectArticle(articleId.value)
  },
  { immediate: true },
)

function handleSelectVersion(versionId: string) {
  if (versionId === activeVersion.value?.id) return
  store.selectHtmlVersion(articleId.value, versionId)
}

function handleDeleteVersion(versionId: string) {
  if (htmlVersions.value.length <= 1) return
  const version = htmlVersions.value.find((v) => v.id === versionId)
  if (!confirm(`确定删除「${version?.label ?? '该版本'}」？`)) return
  store.deleteHtmlVersion(articleId.value, versionId)
}

function handleBack() {
  router.push('/documents')
}

function handleDownloadHtml() {
  const html = aiHtml.value
  if (!html) return
  downloadHtmlFile(html, articleFileName.value)
}

function confirmLeaveIfDirty() {
  if (!editorDirty.value) return true
  return confirm('有未保存的可视化修改，确定离开？')
}

function formatTime(ts?: number) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN')
}

function formatVersionTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onBeforeRouteLeave((_to, _from, next) => {
  teardownPreviewPageLayout()
  next(confirmLeaveIfDirty())
})

onBeforeUnmount(() => {
  teardownPreviewPageLayout()
})
</script>

<template>
  <div class="workspace-page">
    <div v-if="!article" class="workspace-empty">
      <p>未找到该文稿</p>
      <button type="button" class="workspace-btn primary" @click="handleBack">返回文稿管理</button>
    </div>

    <template v-else>
      <p v-if="parseError" class="workspace-error">{{ parseError }}</p>
      <p v-if="optimizeError" class="workspace-error">{{ optimizeError }}</p>

      <div v-if="loadingHtml" class="workspace-loading">正在加载 HTML…</div>

      <VisualHtmlEditor
        v-else-if="showEditor"
        :key="editorMountKey"
        ref="editorRef"
        :initial-html="frameHtml"
        :title="article.title"
        cancel-label="← 返回文稿"
        :default-mode="initialMode"
        :enable-version-bar="false"
        :show-save-button="false"
        :show-download-button="false"
        :preview-scope-id="previewScopeId"
        @cancel="handleBack"
        @frame-load="handleEditorFrameLoad"
        @mode-change="handleModeChange"
        @dirty-change="editorDirty = $event"
      >
        <template #toolbar-extra>
          <span v-if="activeVersion" class="workspace-meta">
            生成于 {{ formatTime(activeVersion.createdAt) }}
          </span>
          <span v-else-if="isLearningTemplate" class="workspace-meta">学习模板</span>
          <span class="workspace-status" :class="{ warn: statusWarn }">
            {{ status || (editorMode === 'preview' ? '预览模式 · 每页 1080×1440' : '编辑模式 · 点选元素修改') }}
          </span>
        </template>

        <template #toolbar-trailing="{ mode }">
          <template v-if="mode === 'preview'">
            <button
              type="button"
              class="workspace-toolbar-btn"
              :disabled="!previewReady"
              @click="showLayoutReport"
            >
              布局报告
            </button>
            <button
              type="button"
              class="workspace-toolbar-btn"
              :disabled="!previewReady || exporting"
              @click="exportAll"
            >
              {{ exporting ? '导出中…' : '导出全部 PNG' }}
            </button>
            <button
              type="button"
              class="workspace-toolbar-btn primary"
              :disabled="!aiHtml"
              @click="handleDownloadHtml"
            >
              导出 HTML
            </button>
          </template>
        </template>

        <template #header-extra>
          <div v-if="htmlVersions.length > 0" class="workspace-versions">
            <span class="workspace-versions-label">HTML 版本</span>
            <div class="workspace-version-list">
              <button
                v-for="version in htmlVersions"
                :key="version.id"
                type="button"
                class="workspace-version-chip"
                :class="{ active: version.id === activeVersion?.id }"
                :title="version.summary || version.label"
                @click="handleSelectVersion(version.id)"
              >
                <span class="workspace-version-name">{{ version.label }}</span>
                <span class="workspace-version-time">{{ formatVersionTime(version.createdAt) }}</span>
                <span
                  v-if="htmlVersions.length > 1"
                  class="workspace-version-delete"
                  title="删除此版本"
                  @click.stop="handleDeleteVersion(version.id)"
                >×</span>
              </button>
            </div>
          </div>
          <p
            v-if="previewSummary"
            class="workspace-summary"
            :class="{ 'workspace-summary--template': isLearningTemplate }"
          >
            {{ previewSummary }}
          </p>
        </template>

        <template #ai-panel>
          <HtmlAiAssistant
            :article-id="articleId"
            :html="aiHtml"
            :doc-element="docRef"
            :file-name="articleFileName"
            :disabled="isLearningTemplate || !previewReady"
            @html-updated="handleAiHtmlUpdated"
            @status-change="handleAiStatus"
            @error="handleAiError"
          />
        </template>
      </VisualHtmlEditor>
    </template>

    <div v-if="showReport" class="report-panel">
      <div class="report-panel-head">
        <span>布局报告 — 可复制 JSON；或在右侧 AI 助手点击「布局优化」自动调整</span>
        <button type="button" @click="copyReport">复制</button>
        <button type="button" @click="closeReport">关闭</button>
      </div>
      <textarea :value="reportText" readonly spellcheck="false"></textarea>
    </div>
  </div>
</template>

<style scoped>
.workspace-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  --hh-top-nav-height: 48px;
}

.workspace-empty,
.workspace-loading {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #888;
  font-size: 14px;
}

.workspace-btn {
  padding: 7px 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  color: #333;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.workspace-btn.primary {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}

.workspace-meta {
  font-size: 12px;
  color: #888;
}

.workspace-status {
  font-size: 12px;
  color: #888;
}

.workspace-status.warn {
  color: #d97706;
}

.workspace-toolbar-btn {
  padding: 7px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  color: #0f172a;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.workspace-toolbar-btn:hover:not(:disabled) {
  background: rgb(124 58 237 / 0.08);
}

.workspace-toolbar-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.workspace-toolbar-btn.primary {
  background: #7c3aed;
  border-color: rgb(124 58 237 / 0.45);
  color: #fff;
}

.workspace-toolbar-btn.primary:hover:not(:disabled) {
  background: #6d28d9;
}

.workspace-error {
  margin: 0;
  padding: 8px 20px;
  font-size: 13px;
  color: #dc2626;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
}

.workspace-versions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 20px;
  background: #fff;
  border-bottom: 1px solid #e5e5ea;
  flex-shrink: 0;
  overflow-x: auto;
}

.workspace-versions-label {
  font-size: 12px;
  color: #888;
  flex-shrink: 0;
}

.workspace-version-list {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
}

.workspace-version-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid #ddd;
  border-radius: 999px;
  background: #fafafa;
  color: #444;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  flex-shrink: 0;
}

.workspace-version-chip:hover {
  background: #f0f0f0;
  border-color: #ccc;
}

.workspace-version-chip.active {
  background: #ede9fe;
  border-color: #7c3aed;
  color: #5b21b6;
}

.workspace-version-name {
  font-weight: 500;
}

.workspace-version-time {
  color: #888;
  font-size: 11px;
}

.workspace-version-chip.active .workspace-version-time {
  color: #7c3aed;
}

.workspace-version-delete {
  margin-left: 2px;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
  color: #aaa;
}

.workspace-version-delete:hover {
  background: #fecaca;
  color: #dc2626;
}

.workspace-summary {
  margin: 0;
  padding: 8px 20px;
  font-size: 13px;
  color: #555;
  background: #f5f3ff;
  border-bottom: 1px solid #e5e5ea;
}

.workspace-summary--template {
  color: #7c3aed;
  background: #f8f5ff;
}

.report-panel {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 200;
  width: min(520px, calc(100vw - 32px));
  max-height: min(420px, calc(100vh - 80px));
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  color: #eee;
  font-size: 13px;
}

.report-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #333;
  flex-shrink: 0;
}

.report-panel-head span {
  flex: 1;
  line-height: 1.4;
}

.report-panel-head button {
  padding: 6px 10px;
  border: 1px solid #555;
  border-radius: 4px;
  background: #2a2a2a;
  color: #fff;
  cursor: pointer;
  font: inherit;
  flex-shrink: 0;
}

.report-panel textarea {
  flex: 1;
  min-height: 200px;
  margin: 0;
  padding: 10px 12px;
  border: none;
  resize: vertical;
  background: #111;
  color: #a3e635;
  font: 12px/1.45 ui-monospace, Consolas, monospace;
}
</style>
