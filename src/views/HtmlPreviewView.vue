<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTextToPicPreview } from '@/composables/useTextToPicPreview'
import HtmlPreviewFrame from '@/components/HtmlPreviewFrame.vue'
import {
  HtmlAiAssistant,
  type HtmlAiChatHtmlUpdatedPayload,
} from '@/html-ai-assistant'
import { useArticlesStore } from '@/stores/articles'
import { getActiveHtmlVersion, getArticleHtmlVersions } from '@/types/document'
import { parseTextToPicHtml, updateDocInHtml } from '@/utils/parse-html'
import { resolveAssetsInHtml, restoreAssetRefsInHtml } from '@/utils/article-asset-html'
import { downloadHtmlFile } from '@/utils/normalize-html'
import templateHtml from '../../template/template.html?raw'

const route = useRoute()
const router = useRouter()
const store = useArticlesStore()

const articleId = computed(() => route.params.id as string)
const article = computed(() => store.getArticleById(articleId.value))
const htmlVersions = computed(() => getArticleHtmlVersions(article.value))
const activeVersion = computed(() => getActiveHtmlVersion(article.value))
const isLearningTemplate = computed(() => !!article.value && !activeVersion.value)
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

const docRef = ref<HTMLElement | null>(null)
const imgInputRef = ref<HTMLInputElement | null>(null)

const previewScopeId = computed(() => `article-preview-${articleId.value}`)

const articleFileName = computed(() => {
  const safeName = article.value?.title.replace(/[\\/:*?"<>|]/g, '_') || 'article'
  return `${safeName}.html`
})

function syncDocToStore(docHtml: string) {
  const version = activeVersion.value
  if (!article.value || !fullHtml.value || !version) return
  const persistedDoc = restoreAssetRefsInHtml(docHtml)
  const updated = updateDocInHtml(fullHtml.value, persistedDoc)
  fullHtml.value = updated
  store.updateArticleHtmlVersion(articleId.value, version.id, updated, {
    summary: version.summary,
  })
}

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
  handleImgInputChange,
} = useTextToPicPreview({
  docRef,
  imgInputRef,
  onDocChanged: syncDocToStore,
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
  try {
    parseTextToPicHtml(html)
    fullHtml.value = html
    frameHtml.value = await resolveAssetsInHtml(html)
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : String(error)
    fullHtml.value = ''
    frameHtml.value = ''
  }
}

function handlePreviewFrameLoad(doc: Document) {
  docRef.value = doc.getElementById('doc')
  previewReady.value = !!docRef.value
  if (!docRef.value) {
    parseError.value = '未找到 #doc，请确认是 TextToPic 模板 HTML'
  }
}

function handlePreviewFrameError(message: string) {
  parseError.value = message
  previewReady.value = false
  docRef.value = null
}

watch(
  previewHtml,
  (html) => {
    if (html) loadFromHtml(html)
    else {
      fullHtml.value = ''
      frameHtml.value = ''
      previewReady.value = false
      docRef.value = null
    }
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

function handleVisualEdit() {
  const version = activeVersion.value
  if (!version) return
  router.push({
    name: 'visual-editor',
    params: { id: articleId.value },
    query: { versionId: version.id },
  })
}

function handleDownloadHtml() {
  if (!fullHtml.value) return
  downloadHtmlFile(fullHtml.value, articleFileName.value)
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
</script>

<template>
  <div class="preview-page">
    <header class="preview-header">
      <button type="button" class="preview-btn" @click="handleBack">← 返回文稿</button>
      <h1 class="preview-title">{{ article?.title ?? 'HTML 预览' }}</h1>
      <span v-if="activeVersion" class="preview-meta">
        生成于 {{ formatTime(activeVersion.createdAt) }}
      </span>
      <span v-else-if="isLearningTemplate" class="preview-meta">
        学习模板
      </span>
      <span class="preview-status" :class="{ warn: statusWarn }">
        {{ status || '点击图片占位区可上传 · 每页 1080×1440' }}
      </span>
      <div class="preview-actions">
        <button
          type="button"
          class="preview-btn"
          :disabled="!activeVersion"
          @click="handleVisualEdit"
        >
          可视化编辑
        </button>
        <button type="button" class="preview-btn" :disabled="!previewReady" @click="showLayoutReport">
          布局报告
        </button>
        <button
          type="button"
          class="preview-btn"
          :disabled="!previewReady || exporting"
          @click="exportAll"
        >
          {{ exporting ? '导出中…' : '导出全部 PNG' }}
        </button>
        <button
          type="button"
          class="preview-btn primary"
          :disabled="!fullHtml"
          @click="handleDownloadHtml"
        >
          导出 HTML
        </button>
      </div>
    </header>

    <div v-if="htmlVersions.length > 0" class="preview-versions">
      <span class="preview-versions-label">HTML 版本</span>
      <div class="preview-version-list">
        <button
          v-for="version in htmlVersions"
          :key="version.id"
          type="button"
          class="preview-version-chip"
          :class="{ active: version.id === activeVersion?.id }"
          :title="version.summary || version.label"
          @click="handleSelectVersion(version.id)"
        >
          <span class="preview-version-name">{{ version.label }}</span>
          <span class="preview-version-time">{{ formatVersionTime(version.createdAt) }}</span>
          <span
            v-if="htmlVersions.length > 1"
            class="preview-version-delete"
            title="删除此版本"
            @click.stop="handleDeleteVersion(version.id)"
          >×</span>
        </button>
      </div>
    </div>

    <p v-if="previewSummary" class="preview-summary" :class="{ 'preview-summary--template': isLearningTemplate }">
      {{ previewSummary }}
    </p>
    <p v-if="parseError" class="preview-error">{{ parseError }}</p>
    <p v-if="optimizeError" class="preview-error">{{ optimizeError }}</p>

    <main class="preview-main">
      <div v-if="!article" class="preview-empty">
        <p>未找到该文稿</p>
        <button type="button" class="preview-btn primary" @click="handleBack">返回文稿管理</button>
      </div>
      <div v-else class="preview-body">
        <div class="preview-canvas">
          <HtmlPreviewFrame
            v-if="frameHtml"
            :html="frameHtml"
            :scope-id="previewScopeId"
            @load="handlePreviewFrameLoad"
            @error="handlePreviewFrameError"
          />
        </div>
        <HtmlAiAssistant
          :article-id="articleId"
          :html="fullHtml"
          :doc-element="docRef"
          :file-name="articleFileName"
          :disabled="isLearningTemplate || !previewReady"
          @html-updated="handleAiHtmlUpdated"
          @status-change="handleAiStatus"
          @error="handleAiError"
        />
      </div>
    </main>

    <input ref="imgInputRef" type="file" accept="image/*" hidden @change="handleImgInputChange" />

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
.preview-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: #e8e8e8;
  color: #1a1a1a;
}

.preview-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  background: #fff;
  border-bottom: 1px solid #e5e5ea;
  flex-shrink: 0;
}

.preview-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.preview-meta {
  font-size: 12px;
  color: #888;
}

.preview-status {
  font-size: 12px;
  color: #888;
}

.preview-status.warn {
  color: #d97706;
}

.preview-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.preview-btn {
  padding: 7px 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  color: #333;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.preview-btn:hover:not(:disabled) {
  background: #f5f5f5;
}

.preview-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.preview-btn.primary {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}

.preview-btn.primary:hover:not(:disabled) {
  background: #6d28d9;
}

.preview-summary {
  margin: 0;
  padding: 8px 20px;
  font-size: 13px;
  color: #555;
  background: #f5f3ff;
  border-bottom: 1px solid #e5e5ea;
}

.preview-summary--template {
  color: #7c3aed;
  background: #f8f5ff;
}

.preview-versions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 20px;
  background: #fff;
  border-bottom: 1px solid #e5e5ea;
  flex-shrink: 0;
  overflow-x: auto;
}

.preview-versions-label {
  font-size: 12px;
  color: #888;
  flex-shrink: 0;
}

.preview-version-list {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
}

.preview-version-chip {
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

.preview-version-chip:hover {
  background: #f0f0f0;
  border-color: #ccc;
}

.preview-version-chip.active {
  background: #ede9fe;
  border-color: #7c3aed;
  color: #5b21b6;
}

.preview-version-name {
  font-weight: 500;
}

.preview-version-time {
  color: #888;
  font-size: 11px;
}

.preview-version-chip.active .preview-version-time {
  color: #7c3aed;
}

.preview-version-delete {
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

.preview-version-delete:hover {
  background: #fecaca;
  color: #dc2626;
}

.preview-error {
  margin: 0;
  padding: 8px 20px;
  font-size: 13px;
  color: #dc2626;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
}

.preview-main {
  flex: 1;
  min-height: 0;
  position: relative;
}

.preview-body {
  display: flex;
  height: 100%;
  min-height: 0;
}

.preview-canvas {
  flex: 1;
  min-width: 0;
  height: 100%;
  min-height: 0;
}

.preview-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #888;
  font-size: 14px;
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

.report-panel-head button:hover {
  background: #3a3a3a;
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
