<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTextToPicPreview } from '@/composables/useTextToPicPreview'
import { useArticlesStore } from '@/stores/articles'
import { parseTextToPicHtml, updateDocInHtml } from '@/utils/parse-html'
import { downloadHtmlFile } from '@/utils/normalize-html'

const route = useRoute()
const router = useRouter()
const store = useArticlesStore()

const articleId = computed(() => route.params.id as string)
const article = computed(() => store.getArticleById(articleId.value))

const fullHtml = shallowRef('')
const docInnerHtml = ref('')
const parseError = ref('')

const canvasRef = ref<HTMLElement | null>(null)
const docRef = ref<HTMLElement | null>(null)
const imgInputRef = ref<HTMLInputElement | null>(null)
let injectedStyle: HTMLStyleElement | null = null

function syncDocToStore(docHtml: string) {
  if (!article.value || !fullHtml.value) return
  const updated = updateDocInHtml(fullHtml.value, docHtml)
  fullHtml.value = updated
  store.updateArticleHtml(articleId.value, updated, { summary: article.value.htmlSummary })
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
  () => article.value?.generatedHtml,
  (html) => {
    if (html) loadFromHtml(html)
    else {
      fullHtml.value = ''
      docInnerHtml.value = ''
    }
  },
  { immediate: true },
)

function handleBack() {
  router.push('/documents')
}

function handleDownloadHtml() {
  if (!fullHtml.value) return
  const safeName = article.value?.title.replace(/[\\/:*?"<>|]/g, '_') || 'article'
  downloadHtmlFile(fullHtml.value, `${safeName}.html`)
}

function formatTime(ts?: number) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN')
}
</script>

<template>
  <div class="preview-page">
    <header class="preview-header">
      <button type="button" class="preview-btn" @click="handleBack">← 返回文稿</button>
      <h1 class="preview-title">{{ article?.title ?? 'HTML 预览' }}</h1>
      <span v-if="article?.htmlGeneratedAt" class="preview-meta">
        生成于 {{ formatTime(article.htmlGeneratedAt) }}
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

    <p v-if="article?.htmlSummary" class="preview-summary">{{ article.htmlSummary }}</p>
    <p v-if="parseError" class="preview-error">{{ parseError }}</p>

    <main class="preview-main">
      <div v-if="!article" class="preview-empty">
        <p>未找到该文稿</p>
        <button type="button" class="preview-btn primary" @click="handleBack">返回文稿管理</button>
      </div>
      <div v-else-if="!article.generatedHtml" class="preview-empty">
        <p>该文稿尚未生成 HTML，请先在文稿页点击「生成 HTML」</p>
        <button type="button" class="preview-btn primary" @click="handleBack">返回文稿管理</button>
      </div>
      <div v-else ref="canvasRef" class="preview-canvas">
        <div class="doc-scroll">
          <div id="doc" ref="docRef" v-html="docInnerHtml"></div>
        </div>
      </div>
    </main>

    <input ref="imgInputRef" type="file" accept="image/*" hidden @change="handleImgInputChange" />

    <div v-if="showReport" class="report-panel">
      <div class="report-panel-head">
        <span>布局报告 — 复制后连同 HTML 发给 AI 做第二轮调整</span>
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

.preview-canvas {
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
