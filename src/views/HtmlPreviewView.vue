<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isAiReady } from '@/ai'
import { useTextToPicPreview } from '@/composables/useTextToPicPreview'
import HtmlPreviewChatPanel, { type ChatMessage } from '@/components/HtmlPreviewChatPanel.vue'
import { editHtmlWithChat } from '@/services/edit-html-with-chat'
import { fixLayoutWithAi } from '@/services/fix-layout-with-ai'
import { useArticlesStore } from '@/stores/articles'
import { getActiveHtmlVersion, getArticleHtmlVersions, hasArticleHtml } from '@/types/document'
import { parseTextToPicHtml, updateDocInHtml } from '@/utils/parse-html'
import { generateLayoutReport } from '@/utils/texttopic/layout-report'
import { downloadHtmlFile } from '@/utils/normalize-html'

const route = useRoute()
const router = useRouter()
const store = useArticlesStore()

const articleId = computed(() => route.params.id as string)
const article = computed(() => store.getArticleById(articleId.value))
const htmlVersions = computed(() => getArticleHtmlVersions(article.value))
const activeVersion = computed(() => getActiveHtmlVersion(article.value))

const fullHtml = shallowRef('')
const docInnerHtml = ref('')
const parseError = ref('')
const optimizing = ref(false)
const optimizeError = ref('')
const chatBusy = ref(false)
const chatMessages = ref<ChatMessage[]>([])

const canvasRef = ref<HTMLElement | null>(null)
const docRef = ref<HTMLElement | null>(null)
const imgInputRef = ref<HTMLInputElement | null>(null)
let injectedStyle: HTMLStyleElement | null = null

function syncDocToStore(docHtml: string) {
  const version = activeVersion.value
  if (!article.value || !fullHtml.value || !version) return
  const updated = updateDocInHtml(fullHtml.value, docHtml)
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
  refreshPreview,
  showLayoutReport,
  copyReport,
  exportAll,
  closeReport,
  handleImgInputChange,
} = useTextToPicPreview({
  docRef,
  canvasRef,
  imgInputRef,
  onDocChanged: syncDocToStore,
})

async function loadFromHtml(html: string) {
  parseError.value = ''
  try {
    const parsed = parseTextToPicHtml(html)
    fullHtml.value = html
    docInnerHtml.value = parsed.docInnerHtml
    await nextTick()
    if (canvasRef.value) {
      if (!injectedStyle) {
        injectedStyle = document.createElement('style')
        canvasRef.value.insertBefore(injectedStyle, canvasRef.value.firstChild)
      }
      injectedStyle.textContent = parsed.styles
    }
    refreshPreview()
  } catch (error) {
    parseError.value = error instanceof Error ? error.message : String(error)
    docInnerHtml.value = ''
  }
}

watch(
  () => activeVersion.value?.html,
  (html) => {
    if (html) loadFromHtml(html)
    else {
      fullHtml.value = ''
      docInnerHtml.value = ''
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

function handleDownloadHtml() {
  if (!fullHtml.value) return
  const safeName = article.value?.title.replace(/[\\/:*?"<>|]/g, '_') || 'article'
  downloadHtmlFile(fullHtml.value, `${safeName}.html`)
}

function formatOptimizeLabel() {
  return new Date().toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function nextChatId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function pushChatMessage(message: ChatMessage) {
  chatMessages.value = [...chatMessages.value, message]
}

async function handleChatSend(userMessage: string) {
  const doc = docRef.value
  if (!doc || !fullHtml.value || chatBusy.value || optimizing.value) return

  if (!isAiReady()) {
    if (confirm('请先在设置页配置 DeepSeek API 密钥，是否前往设置？')) {
      router.push('/settings')
    }
    return
  }

  pushChatMessage({ id: nextChatId(), role: 'user', content: userMessage })
  chatBusy.value = true
  optimizeError.value = ''
  status.value = 'AI 正在处理你的请求…'
  statusWarn.value = false

  try {
    const report = generateLayoutReport(doc, canvasRef.value ?? undefined)
    const safeName = article.value?.title.replace(/[\\/:*?"<>|]/g, '_') || 'article'
    const result = await editHtmlWithChat({
      fileName: `${safeName}.html`,
      content: fullHtml.value,
      userMessage,
      report,
    })

    pushChatMessage({
      id: nextChatId(),
      role: 'assistant',
      content: result.summary || (result.changed ? '修改已完成' : '无需修改'),
      changed: result.changed,
    })

    if (!result.changed) {
      status.value = result.summary || 'AI 认为当前无需调整'
      statusWarn.value = report.overflowPageCount > 0
      return
    }

    store.addArticleHtmlVersion(articleId.value, result.content, {
      summary: result.summary,
      label: `AI 修改 ${formatOptimizeLabel()}`,
    })
    status.value = `AI 修改完成：${result.summary}`
    statusWarn.value = false
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    optimizeError.value = message
    status.value = message
    statusWarn.value = true
    pushChatMessage({ id: nextChatId(), role: 'assistant', content: `出错了：${message}` })
  } finally {
    chatBusy.value = false
  }
}

async function handleAiLayoutFix() {
  const doc = docRef.value
  if (!doc || !fullHtml.value || optimizing.value) return

  if (!isAiReady()) {
    if (confirm('请先在设置页配置 DeepSeek API 密钥，是否前往设置？')) {
      router.push('/settings')
    }
    return
  }

  optimizing.value = true
  optimizeError.value = ''
  status.value = '正在分析布局并请求 AI 调整…'
  statusWarn.value = false

  try {
    const report = generateLayoutReport(doc, canvasRef.value ?? undefined)
    const safeName = article.value?.title.replace(/[\\/:*?"<>|]/g, '_') || 'article'
    const result = await fixLayoutWithAi({
      fileName: `${safeName}.html`,
      content: fullHtml.value,
      report,
    })

    if (!result.changed) {
      status.value = result.summary || 'AI 认为当前布局无需调整'
      statusWarn.value = report.overflowPageCount > 0
      return
    }

    store.addArticleHtmlVersion(articleId.value, result.content, {
      summary: result.summary,
      label: `布局优化 ${formatOptimizeLabel()}`,
    })
    status.value = `AI 布局优化完成：${result.summary}`
    statusWarn.value = false
  } catch (error) {
    optimizeError.value = error instanceof Error ? error.message : String(error)
    status.value = optimizeError.value
    statusWarn.value = true
  } finally {
    optimizing.value = false
  }
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
      <span class="preview-status" :class="{ warn: statusWarn }">
        {{ status || '点击图片占位区可上传 · 每页 1080×1440' }}
      </span>
      <div class="preview-actions">
        <button type="button" class="preview-btn" :disabled="!docInnerHtml" @click="showLayoutReport">
          布局报告
        </button>
        <button
          type="button"
          class="preview-btn accent"
          :disabled="!docInnerHtml || optimizing"
          @click="handleAiLayoutFix"
        >
          {{ optimizing ? 'AI 优化中…' : 'AI 布局优化' }}
        </button>
        <button
          type="button"
          class="preview-btn"
          :disabled="!docInnerHtml || exporting"
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

    <p v-if="activeVersion?.summary" class="preview-summary">{{ activeVersion.summary }}</p>
    <p v-if="parseError" class="preview-error">{{ parseError }}</p>
    <p v-if="optimizeError" class="preview-error">{{ optimizeError }}</p>

    <main class="preview-main">
      <div v-if="!article" class="preview-empty">
        <p>未找到该文稿</p>
        <button type="button" class="preview-btn primary" @click="handleBack">返回文稿管理</button>
      </div>
      <div v-else-if="!hasArticleHtml(article)" class="preview-empty">
        <p>该文稿尚未生成 HTML，请先在文稿页点击「生成 HTML」</p>
        <button type="button" class="preview-btn primary" @click="handleBack">返回文稿管理</button>
      </div>
      <div v-else class="preview-body">
        <div ref="canvasRef" class="preview-canvas">
          <div class="doc-scroll">
            <div id="doc" ref="docRef" v-html="docInnerHtml"></div>
          </div>
        </div>
        <HtmlPreviewChatPanel
          :messages="chatMessages"
          :disabled="!docInnerHtml"
          :busy="chatBusy"
          @send="handleChatSend"
        />
      </div>
    </main>

    <input ref="imgInputRef" type="file" accept="image/*" hidden @change="handleImgInputChange" />

    <div v-if="showReport" class="report-panel">
      <div class="report-panel-head">
        <span>布局报告 — 可复制 JSON；或直接点顶部「AI 布局优化」自动调整</span>
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

.preview-btn.accent {
  background: #0ea5e9;
  border-color: #0ea5e9;
  color: #fff;
}

.preview-btn.accent:hover:not(:disabled) {
  background: #0284c7;
}

.preview-summary {
  margin: 0;
  padding: 8px 20px;
  font-size: 13px;
  color: #555;
  background: #f5f3ff;
  border-bottom: 1px solid #e5e5ea;
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
  --preview-scale: 0.38;
}

.preview-canvas :deep(.doc-scroll) {
  overflow: auto;
  padding: 24px;
  height: 100%;
}

.preview-canvas :deep(#doc) {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 24px;
  width: max-content;
  min-width: 100%;
  justify-content: center;
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
