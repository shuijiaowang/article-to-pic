<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useTextToPicPreview } from '@/composables/useTextToPicPreview'
import { HtmlAiAssistant } from '@/html-ai-assistant'
import type { HtmlAiChatHtmlUpdatedPayload } from '@/html-ai-assistant/types'
import { VisualHtmlEditor, type VisualHtmlEditorExpose } from '@/visual-html-editor'
import { useArticlesStore } from '@/stores/articles'
import { getActiveHtmlVersion, getArticleHtmlVersions } from '@/types/document'
import {
  articleToVheState,
  vheStateToArticleVersions,
  type VheVersionState,
} from '@/utils/article-vhe-versions'
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
const activeVersion = computed(() => getActiveHtmlVersion(article.value))
const isLearningTemplate = computed(() => !!article.value && !activeVersion.value)

const initialMode = computed<'edit' | 'preview'>(() => {
  const raw = route.query.mode
  return raw === 'edit' ? 'edit' : 'preview'
})

const previewSummary = computed(() => {
  if (activeVersion.value?.summary) return activeVersion.value.summary
  if (isLearningTemplate.value) {
    return '当前显示的是学习用预览模板。你可以先熟悉分页和版式，再返回文稿管理点击「生成 HTML」获得正式版本。'
  }
  return ''
})

const fullHtml = shallowRef('')
const frameHtml = ref('')
/** 当前工作台会话绑定的文稿 id；落盘只写这个文稿，避免切稿串写 */
const boundArticleId = ref('')
const bootstrappedVersionState = shallowRef<VheVersionState | null>(null)
const previewReady = ref(false)
const parseError = ref('')
const optimizeError = ref('')
const editorDirty = ref(false)
const editorMode = ref<'edit' | 'preview'>(initialMode.value)
/** 学习模板下仅在用户真正改动/新建版本后才写入该文稿 */
const userTouchedVersions = ref(false)

const editorRef = ref<VisualHtmlEditorExpose | null>(null)
const docRef = ref<HTMLElement | null>(null)

const previewScopeId = computed(() => `article-preview-${articleId.value}`)
const loadingHtml = ref(false)
const editorBootToken = ref(0)

const articleFileName = computed(() => {
  const safeName = article.value?.title.replace(/[\\/:*?"<>|]/g, '_') || 'article'
  return `${safeName}.html`
})

const persistKey = computed(() =>
  boundArticleId.value ? `article:${boundArticleId.value}` : '',
)

/** 按文稿隔离挂载，确保工作台只承载当前文稿的子版本 */
const editorMountKey = computed(
  () => `${boundArticleId.value || articleId.value}:${editorBootToken.value}`,
)

const showEditor = computed(
  () => !!article.value
    && !!boundArticleId.value
    && boundArticleId.value === articleId.value
    && !!frameHtml.value
    && !loadingHtml.value
    && !parseError.value,
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

function articleIdFromPersistKey(key: string) {
  const raw = String(key || '').trim()
  return raw.startsWith('article:') ? raw.slice('article:'.length) : ''
}

async function resolveVersionState(state: VheVersionState): Promise<VheVersionState> {
  const versions = await Promise.all(
    state.versions.map(async (item) => ({
      ...item,
      html: await resolveAssetsInHtml(String(item.html ?? '')),
    })),
  )
  return { ...state, versions }
}

function restoreVersionState(state: VheVersionState): VheVersionState {
  return {
    ...state,
    versions: state.versions.map((item) => ({
      ...item,
      html: restoreAssetRefsInHtml(String(item.html ?? '')),
    })),
  }
}

const articleVersionPersistence = {
  load(key: string): VheVersionState | null {
    const id = articleIdFromPersistKey(key)
    if (!id || id !== boundArticleId.value) return null
    return bootstrappedVersionState.value
  },
  save(key: string, state: VheVersionState) {
    const id = articleIdFromPersistKey(key)
    if (!id) return

    const target = store.getArticleById(id)
    if (!target) return

    const existingCount = getArticleHtmlVersions(target).length
    // 仅当写入目标就是当前工作台会话，且允许落盘时，才用 userTouched 门槛
    if (!existingCount) {
      if (id !== boundArticleId.value || !userTouchedVersions.value) return
    }

    const converted = vheStateToArticleVersions(restoreVersionState(state))
    if (!converted) return

    store.replaceArticleHtmlVersions(
      id,
      converted.versions,
      converted.activeHtmlVersionId,
    )

    if (id === boundArticleId.value) {
      const active = converted.versions.find((v) => v.id === converted.activeHtmlVersionId)
      if (active) fullHtml.value = active.html
    }
  },
  remove(_key: string) {
    // 版本由 replaceArticleHtmlVersions 整体替换管理
  },
}

async function bootstrapEditor(forArticleId: string) {
  parseError.value = ''
  previewReady.value = false
  docRef.value = null
  loadingHtml.value = true
  userTouchedVersions.value = false
  bootstrappedVersionState.value = null
  frameHtml.value = ''
  fullHtml.value = ''
  boundArticleId.value = forArticleId

  const targetArticle = store.getArticleById(forArticleId)
  if (!targetArticle) {
    loadingHtml.value = false
    boundArticleId.value = ''
    return
  }

  try {
    const rawState = articleToVheState(targetArticle)
    if (rawState?.versions.length) {
      for (const item of rawState.versions) {
        parseTextToPicHtml(String(item.html ?? ''))
      }
      const resolved = await resolveVersionState(rawState)
      // 异步期间若已切到其它文稿，丢弃本次结果
      if (articleId.value !== forArticleId) return
      bootstrappedVersionState.value = resolved
      const active = resolved.versions.find((item) => item.id === resolved.activeVersionId)
        ?? resolved.versions[resolved.versions.length - 1]
      frameHtml.value = String(active?.html ?? '')
      const activeRaw = rawState.versions.find((item) => item.id === rawState.activeVersionId)
        ?? rawState.versions[rawState.versions.length - 1]
      fullHtml.value = String(activeRaw?.html ?? '')
    } else {
      const safeTitle = targetArticle.title.trim() || '未命名文稿'
      const html = templateHtml.replace(
        /<title>[\s\S]*?<\/title>/i,
        `<title>${safeTitle} - 预览模板</title>`,
      )
      if (!html) return
      parseTextToPicHtml(html)
      if (articleId.value !== forArticleId) return
      fullHtml.value = html
      frameHtml.value = await resolveAssetsInHtml(html)
      if (articleId.value !== forArticleId) return
    }
    editorBootToken.value += 1
  } catch (error) {
    if (articleId.value !== forArticleId) return
    parseError.value = error instanceof Error ? error.message : String(error)
    fullHtml.value = ''
    frameHtml.value = ''
    bootstrappedVersionState.value = null
  } finally {
    if (articleId.value === forArticleId) {
      loadingHtml.value = false
    }
  }
}

function handleAiStatus(message: string, warn = false) {
  status.value = message
  statusWarn.value = warn
}

function handleAiError(message: string) {
  optimizeError.value = message
}

async function handleAiHtmlUpdated(payload: HtmlAiChatHtmlUpdatedPayload) {
  userTouchedVersions.value = true
  optimizeError.value = ''
  try {
    parseTextToPicHtml(payload.content)
    const resolved = await resolveAssetsInHtml(payload.content)
    const entry = await editorRef.value?.importAsNewVersion?.(resolved, {
      label: payload.label,
      summary: payload.summary,
    })
    if (!entry) {
      store.addArticleHtmlVersion(articleId.value, payload.content, {
        summary: payload.summary,
        label: payload.label,
      })
      await bootstrapEditor(articleId.value)
      return
    }
    fullHtml.value = payload.content
    editorRef.value?.flushPersistedDraft?.()
  } catch (error) {
    optimizeError.value = error instanceof Error ? error.message : String(error)
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

function handleDirtyChange(dirty: boolean) {
  editorDirty.value = dirty
  if (dirty) userTouchedVersions.value = true
}

function handleVersionCreate() {
  userTouchedVersions.value = true
}

function handleVersionDelete() {
  userTouchedVersions.value = true
}

watch(
  articleId,
  async (id, prevId) => {
    if (!id) return
    // 先把上一文稿会话刷盘，再切换绑定
    if (prevId && prevId !== id && editorRef.value) {
      editorRef.value.flushPersistedDraft?.()
    }
    store.selectArticle(id)
    await bootstrapEditor(id)
  },
  { immediate: true },
)

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

onBeforeRouteLeave((_to, _from, next) => {
  editorRef.value?.flushPersistedDraft?.()
  teardownPreviewPageLayout()
  next(confirmLeaveIfDirty())
})

onBeforeUnmount(() => {
  editorRef.value?.flushPersistedDraft?.()
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
        :enable-version-bar="true"
        :show-save-button="false"
        :show-download-button="false"
        :preview-scope-id="previewScopeId"
        :persist-key="persistKey"
        :persist-label="article.title"
        :persistence="articleVersionPersistence"
        @cancel="handleBack"
        @frame-load="handleEditorFrameLoad"
        @mode-change="handleModeChange"
        @dirty-change="handleDirtyChange"
        @version-create="handleVersionCreate"
        @version-delete="handleVersionDelete"
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
