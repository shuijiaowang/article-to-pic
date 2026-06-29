<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useArticlesStore } from '@/stores/articles'
import { downloadHtmlFile } from '@/utils/normalize-html'

const route = useRoute()
const router = useRouter()
const store = useArticlesStore()

const articleId = computed(() => route.params.id as string)

const article = computed(() => store.getArticleById(articleId.value))

const iframeHtml = ref('')

watch(
  () => article.value?.generatedHtml,
  (html) => {
    iframeHtml.value = html ?? ''
  },
  { immediate: true },
)

function handleBack() {
  router.push('/documents')
}

function handleDownloadHtml() {
  if (!article.value?.generatedHtml) return
  const safeName = article.value.title.replace(/[\\/:*?"<>|]/g, '_') || 'article'
  downloadHtmlFile(article.value.generatedHtml, `${safeName}.html`)
}

function triggerIframeExport() {
  const iframe = document.getElementById('html-preview-frame') as HTMLIFrameElement | null
  const btn = iframe?.contentDocument?.getElementById('btn-export-all')
  btn?.click()
}

function triggerLayoutReport() {
  const iframe = document.getElementById('html-preview-frame') as HTMLIFrameElement | null
  const btn = iframe?.contentDocument?.getElementById('btn-layout-report')
  btn?.click()
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
      <div class="preview-actions">
        <button
          type="button"
          class="preview-btn"
          :disabled="!article?.generatedHtml"
          @click="triggerLayoutReport"
        >
          布局报告
        </button>
        <button
          type="button"
          class="preview-btn"
          :disabled="!article?.generatedHtml"
          @click="triggerIframeExport"
        >
          导出全部 PNG
        </button>
        <button
          type="button"
          class="preview-btn primary"
          :disabled="!article?.generatedHtml"
          @click="handleDownloadHtml"
        >
          导出 HTML
        </button>
      </div>
    </header>

    <p v-if="article?.htmlSummary" class="preview-summary">{{ article.htmlSummary }}</p>

    <main class="preview-main">
      <div v-if="!article" class="preview-empty">
        <p>未找到该文稿</p>
        <button type="button" class="preview-btn primary" @click="handleBack">返回文稿管理</button>
      </div>
      <div v-else-if="!article.generatedHtml" class="preview-empty">
        <p>该文稿尚未生成 HTML，请先在文稿页点击「生成 HTML」</p>
        <button type="button" class="preview-btn primary" @click="handleBack">返回文稿管理</button>
      </div>
      <iframe
        v-else
        id="html-preview-frame"
        class="preview-frame"
        :srcdoc="iframeHtml"
        title="HTML 预览"
        sandbox="allow-scripts allow-same-origin allow-downloads"
      ></iframe>
    </main>
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

.preview-main {
  flex: 1;
  min-height: 0;
  position: relative;
}

.preview-frame {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background: #e8e8e8;
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
</style>
