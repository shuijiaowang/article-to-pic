<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { initEditor, type EditorApi } from '@/editor/editor'
import { useArticlesStore } from '@/stores/articles'
import { getActiveHtmlVersion, hasArticleHtml } from '@/types/document'
import { downloadHtmlFile } from '@/utils/normalize-html'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const store = useArticlesStore()
const { showToast } = useToast()

const articleId = computed(() => route.params.id as string)
const article = computed(() => store.getArticleById(articleId.value))
const activeVersion = computed(() => getActiveHtmlVersion(article.value))

const saving = ref(false)
const loadError = ref('')

let editorApi: EditorApi | undefined
let suppressNextHtmlWatch = false

function confirmLeaveIfDirty() {
  if (!editorApi?.isDirty()) return true
  return confirm('有未保存的修改，确定离开？')
}

function handleBack() {
  if (!confirmLeaveIfDirty()) return
  router.push({ name: 'html-preview', params: { id: articleId.value } })
}

async function loadArticleHtml() {
  if (!editorApi) return

  const version = activeVersion.value
  if (!article.value || !version?.html) {
    loadError.value = article.value ? '该文稿尚无 HTML 版本' : '未找到该文稿'
    return
  }

  loadError.value = ''
  const safeName = article.value.title.replace(/[\\/:*?"<>|]/g, '_') || 'article'
  await editorApi.loadHtml(version.html, safeName)
}

async function handleSaveToStore() {
  if (!editorApi || !article.value || !activeVersion.value) return
  if (!editorApi.isDirty()) {
    showToast('info', '当前没有待保存修改')
    return
  }

  const html = editorApi.serializeHtml()
  if (!html) {
    showToast('error', '保存失败：无法序列化 HTML')
    return
  }

  saving.value = true
  suppressNextHtmlWatch = true
  store.updateArticleHtmlVersion(articleId.value, activeVersion.value.id, html)
  editorApi.markClean()
  editorApi.refreshStatus()
  saving.value = false
  showToast('success', '修改已保存')
}

function handleDownloadHtml() {
  const html = editorApi?.serializeHtml()
  if (!html) return
  const safeName = article.value?.title?.replace(/[\\/:*?"<>|]/g, '_') || 'article'
  downloadHtmlFile(html, `${safeName}.html`)
}

function handleKeydown(e: KeyboardEvent) {
  if (!editorApi) return
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    handleSaveToStore()
  }
}

onMounted(async () => {
  editorApi = initEditor()
  document.addEventListener('keydown', handleKeydown)
  await loadArticleHtml()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  editorApi?.destroy()
})

watch(
  () => activeVersion.value?.html,
  async (html) => {
    if (!html || !editorApi) return
    if (suppressNextHtmlWatch) {
      suppressNextHtmlWatch = false
      return
    }
    if (editorApi.isDirty() && !confirm('切换版本将丢失未保存修改，是否继续？')) return
    const safeName = article.value?.title.replace(/[\\/:*?"<>|]/g, '_') || 'article'
    await editorApi.loadHtml(html, safeName)
  },
)

onBeforeRouteLeave((_to, _from, next) => {
  next(confirmLeaveIfDirty())
})
</script>

<template>
  <div class="editor-page">
    <header class="ed-toolbar">
      <button type="button" class="ed-btn" @click="handleBack">← 返回预览</button>
      <h1 class="ed-title">{{ article?.title ?? 'HTML 可视化编辑' }}</h1>
      <button
        type="button"
        class="ed-btn primary"
        :disabled="!activeVersion || saving"
        @click="handleSaveToStore"
      >
        {{ saving ? '保存中…' : '保存修改' }}
      </button>
      <button type="button" class="ed-btn" :disabled="!activeVersion" @click="handleDownloadHtml">
        导出 HTML
      </button>

      <span class="ed-status" id="status">点击页面或内容块进行编辑 · Ctrl+S 保存</span>
    </header>

    <p v-if="loadError" class="ed-error">{{ loadError }}</p>

    <main class="ed-main">
      <div class="ed-canvas-wrap" id="canvas-wrap">
        <div v-if="!hasArticleHtml(article)" class="ed-empty ed-empty--article">
          <p>该文稿尚未生成 HTML</p>
          <button type="button" class="ed-btn primary" @click="handleBack">返回预览</button>
        </div>
        <div id="doc" hidden></div>
        <div id="ed-overlay">
          <div class="ed-sel-box" id="sel-box">
            <span class="ed-sel-label" id="sel-label"></span>
            <button
              type="button"
              class="ed-sel-delete"
              title="删除（图片元素则清除图片，块则删除整块）"
            >
              ×
            </button>
            <div
              class="ed-handle ed-handle-n"
              data-handle="margin-top"
              title="拖动调整上外边距"
            ></div>
            <div
              class="ed-handle ed-handle-w"
              data-handle="margin-left"
              title="拖动调整左外边距"
            ></div>
            <div
              class="ed-handle ed-handle-e"
              data-handle="width"
              title="拖动调整宽度"
            ></div>
          </div>
        </div>
      </div>

      <aside class="ed-panel">
        <div class="ed-panel-head">属性</div>
        <div class="ed-panel-body" id="panel-body">
          <p class="ed-panel-empty">
            点击页面或内容块进行编辑。<br /><br />
            左/上/右三个句柄：水平位置、垂直间距、宽度（图片锁定宽高比）。字号等可在右侧属性面板修改。<br /><br />
            选中图片块后可「清除图片」或「删除图片块」；按 Delete 键可快速删除。<br /><br />
            <strong>保存</strong>：修改后点击「保存修改」或按 Ctrl+S 写回当前 HTML 版本。
          </p>
        </div>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.editor-page {
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: #e8e8e8;
  color: #1a1a1a;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ed-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background: #fff;
  border-bottom: 1px solid #e5e5ea;
  flex-shrink: 0;
}

.ed-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.ed-btn {
  padding: 7px 14px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  color: #333;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.ed-btn:hover:not(:disabled) {
  background: #f5f5f5;
}

.ed-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ed-btn.primary {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}

.ed-btn.primary:hover:not(:disabled) {
  background: #6d28d9;
}

.ed-status {
  margin-left: auto;
  font-size: 12px;
  color: #888;
}

.ed-status.dirty {
  color: #d97706;
}

.ed-error {
  margin: 0;
  padding: 8px 20px;
  font-size: 13px;
  color: #dc2626;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  flex-shrink: 0;
}

.ed-main {
  flex: 1;
  display: flex;
  min-height: 0;
}

.ed-canvas-wrap {
  flex: 1;
  position: relative;
  overflow: auto;
  background: #e8e8e8;
  padding: 24px;
  --preview-scale: 0.38;
}

.ed-canvas-wrap :deep(#doc) {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 24px;
  width: max-content;
  min-width: 100%;
  justify-content: center;
  position: relative;
}

.ed-canvas-wrap :deep(.page-wrap) {
  flex-shrink: 0;
  width: 1080px;
  transform: scale(var(--preview-scale, 0.38));
  transform-origin: top left;
  margin-bottom: calc(1080px * (var(--preview-scale, 0.38) - 1) * -1 + 200px);
  margin-right: calc(1080px * (var(--preview-scale, 0.38) - 1));
}

.ed-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888;
  gap: 16px;
}

.ed-empty p {
  margin: 0;
  font-size: 14px;
}


#ed-overlay {
  position: absolute;
  pointer-events: none;
  z-index: 1000;
  display: none;
}

#ed-overlay.visible {
  display: block;
}

.ed-sel-box {
  position: absolute;
  border: 2px solid #7c3aed;
  box-shadow: 0 0 0 1px rgba(124, 58, 237, 0.25);
  pointer-events: none;
}

.ed-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #fff;
  border: 2px solid #7c3aed;
  border-radius: 2px;
  pointer-events: auto;
  cursor: pointer;
  z-index: 2;
}

.ed-handle::before {
  content: '';
  position: absolute;
  inset: -6px;
}

.ed-handle-n {
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  cursor: ns-resize;
}

.ed-handle-e {
  top: 50%;
  right: -6px;
  transform: translateY(-50%);
  cursor: ew-resize;
}

.ed-handle-w {
  top: 50%;
  left: -6px;
  transform: translateY(-50%);
  cursor: ew-resize;
}

.ed-sel-label {
  position: absolute;
  top: -26px;
  left: 0;
  background: #7c3aed;
  color: #fff;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
}

.ed-sel-delete {
  position: absolute;
  top: -26px;
  right: 0;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: #dc2626;
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  pointer-events: auto;
  z-index: 3;
}

.ed-sel-delete:hover {
  background: #b91c1c;
}

.ed-canvas-wrap :deep(.block.img img) {
  pointer-events: auto;
  cursor: pointer;
}

.ed-canvas-wrap :deep(.block.img img.ed-selected) {
  outline: 2px solid #7c3aed;
  outline-offset: 2px;
}

.ed-canvas-wrap :deep(.page.ed-hover),
.ed-canvas-wrap :deep(.block.ed-hover) {
  outline: 1px dashed rgba(124, 58, 237, 0.45);
  outline-offset: 2px;
}

.ed-canvas-wrap :deep(.page.ed-selected),
.ed-canvas-wrap :deep(.block.ed-selected) {
  outline: 2px solid #7c3aed;
  outline-offset: 2px;
}

.ed-panel {
  width: 300px;
  flex-shrink: 0;
  background: #fff;
  border-left: 1px solid #e5e5ea;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ed-panel-head {
  padding: 14px 16px;
  border-bottom: 1px solid #e5e5ea;
  font-size: 13px;
  font-weight: 600;
  color: #1a1a1a;
}

.ed-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 20px;
}

.ed-panel-body :deep(.ed-panel-empty) {
  color: #888;
  font-size: 13px;
  line-height: 1.6;
}

.ed-panel-body :deep(.ed-field) {
  margin-bottom: 12px;
}

.ed-panel-body :deep(.ed-field label) {
  display: block;
  font-size: 11px;
  color: #888;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ed-panel-body :deep(.ed-field input[type='text']),
.ed-panel-body :deep(.ed-field input[type='number']),
.ed-panel-body :deep(.ed-field select),
.ed-panel-body :deep(.ed-field textarea) {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid #ddd;
  border-radius: 5px;
  background: #fff;
  color: #1a1a1a;
  font: inherit;
  font-size: 13px;
}

.ed-panel-body :deep(.ed-field input:focus),
.ed-panel-body :deep(.ed-field select:focus),
.ed-panel-body :deep(.ed-field textarea:focus) {
  outline: none;
  border-color: #7c3aed;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.12);
}

.ed-panel-body :deep(.ed-field textarea) {
  min-height: 72px;
  resize: vertical;
  line-height: 1.45;
}

.ed-panel-body :deep(.ed-field input[type='color']) {
  width: 100%;
  height: 34px;
  padding: 2px;
  border: 1px solid #ddd;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
}

.ed-panel-body :deep(.ed-field-row) {
  display: flex;
  gap: 8px;
}

.ed-panel-body :deep(.ed-field-row .ed-field) {
  flex: 1;
}

.ed-panel-body :deep(.ed-meta code) {
  font: 11px/1.4 ui-monospace, Consolas, monospace;
  background: #f5f5f5;
  padding: 1px 5px;
  border-radius: 3px;
  color: #555;
}

.ed-panel-body :deep(.ed-tag) {
  display: inline-block;
  margin-top: 4px;
  padding: 1px 8px;
  border-radius: 999px;
  background: #ede9fe;
  color: #7c3aed;
  font-size: 11px;
  font-weight: 500;
}

.ed-panel-body :deep(.ed-hint) {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #aaa;
  line-height: 1.4;
}

.ed-panel-body :deep(.ed-field input[readonly]) {
  background: #f9f9f9;
  color: #666;
  cursor: default;
}

.ed-panel-body :deep(.ed-meta) {
  font-size: 12px;
  color: #666;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e5ea;
  line-height: 1.5;
}

.ed-panel-body :deep(.ed-meta strong) {
  color: #333;
}

.ed-panel-body :deep(.ed-section-title) {
  font-size: 11px;
  color: #7c3aed;
  font-weight: 600;
  margin: 16px 0 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ed-panel-body :deep(.ed-section-title:first-child) {
  margin-top: 0;
}

.ed-panel-body :deep(.ed-btn-row) {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.ed-panel-body :deep(.ed-btn-row button) {
  flex: 1;
  padding: 7px;
  border: 1px solid #ddd;
  border-radius: 5px;
  background: #fff;
  color: #555;
  cursor: pointer;
  font-size: 12px;
}

.ed-panel-body :deep(.ed-btn-row button:hover) {
  background: #f5f5f5;
  color: #1a1a1a;
}

.ed-panel-body :deep(.ed-btn-row button.danger) {
  color: #dc2626;
  border-color: #fecaca;
}

.ed-panel-body :deep(.ed-btn-row button.danger:hover) {
  background: #fef2f2;
  color: #b91c1c;
}
</style>
