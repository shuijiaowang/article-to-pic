<template>
  <div class="vhe-editor-page">
    <header class="vhe-toolbar">
      <slot v-if="slots.toolbar" name="toolbar" v-bind="toolbarSlotProps" />
      <div v-else class="vhe-toolbar-default">
        <div class="vhe-toolbar-leading">
          <button
            v-if="cancelLabel"
            type="button"
            class="vhe-btn"
            @click="handleCancel"
          >
            {{ cancelLabel }}
          </button>
          <h1 v-if="title" class="vhe-title">{{ title }}</h1>
          <slot name="toolbar-extra" v-bind="toolbarSlotProps" />
        </div>
        <div class="vhe-toolbar-actions">
          <div class="vhe-mode-switch" role="group" aria-label="编辑模式切换">
            <button
              type="button"
              class="vhe-mode-btn"
              :class="{ active: mode === 'edit' }"
              @click="setMode('edit')"
            >
              编辑模式
            </button>
            <button
              type="button"
              class="vhe-mode-btn"
              :class="{ active: mode === 'preview' }"
              @click="setMode('preview')"
            >
              预览模式
            </button>
          </div>
          <button
            type="button"
            class="vhe-btn"
            :disabled="!frameUrl"
            title="在新标签页全屏预览"
            @click="handleOpenPreviewInNewTab"
          >
            新窗口预览
          </button>
          <button
            type="button"
            class="vhe-btn vhe-btn-primary"
            :disabled="!canSave"
            @click="handleSave"
          >
            {{ saveLabel }}
          </button>
          <button
            v-if="resolvedDownloadLabel"
            type="button"
            class="vhe-btn"
            :disabled="!frameUrl"
            @click="handleDownload"
          >
            {{ resolvedDownloadLabel }}
          </button>
          <button
            v-if="mode === 'edit'"
            type="button"
            class="vhe-btn"
            :disabled="!frameUrl"
            @click="handleCopyChangeLog"
          >
            {{ changeLogCopied ? '已复制' : '复制修改记录' }}
          </button>
          <button
            v-if="mode === 'edit'"
            type="button"
            class="vhe-btn"
            :disabled="!selectedElement"
            @click="clearSelectedStyle"
          >
            清除选中样式
          </button>
          <span class="vhe-status">{{ statusText }}</span>
        </div>
      </div>
    </header>

    <div v-if="enableVersionBar && versions.length" class="vhe-version-bar" role="navigation" aria-label="版本切换">
      <span class="vhe-version-bar-label">版本</span>
      <div class="vhe-version-tabs">
        <div
          v-for="version in versions"
          :key="version.id"
          class="vhe-version-chip"
          :class="{ active: version.id === activeVersionId }"
        >
          <button
            type="button"
            class="vhe-version-tab"
            :title="`切换到版本 ${version.id}`"
            @click="handleSwitchVersion(version.id)"
          >
            v{{ version.id }}
          </button>
          <button
            v-if="version.id === activeVersionId"
            type="button"
            class="vhe-version-tab-remove"
            :disabled="versions.length <= 1"
            :title="versions.length <= 1 ? '至少保留一个版本' : `删除版本 ${version.id}`"
            @click.stop="handleRemoveVersion(version.id)"
          >
            ×
          </button>
        </div>
        <button
          type="button"
          class="vhe-version-tab vhe-version-tab-add"
          :disabled="!frameUrl"
          title="将当前选中版本的快照保存为新版本"
          @click="handleSaveNewVersion"
        >
          +
        </button>
        <button
          type="button"
          class="vhe-version-tab vhe-version-tab-upload"
          title="上传或粘贴 HTML 源代码，创建新版本"
          @click="openImportVersionDialog"
        >
          上传新版本
        </button>
      </div>
      <span class="vhe-version-hint">当前 v{{ activeVersionId }} · 下载/保存均针对选中版本</span>
    </div>

    <HtmlImportDialog
      v-model="importVersionDialogVisible"
      title="上传新版本"
      hint="上传或粘贴完整 HTML 源代码，将创建新的本地版本（不影响线上）。"
      confirm-label="添加为新版本"
      :show-file-name-field="false"
      :allow-multiple="true"
      @import-items="handleImportVersionItems"
      @error="handleImportVersionError"
    />

    <main class="vhe-main">
      <div class="vhe-viewport-area">
        <iframe
          v-if="frameUrl"
          ref="editFrameRef"
          class="vhe-doc-frame"
          :src="frameUrl"
          title="可视化编辑区"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          @load="handleFrameLoad"
        />
        <p v-else class="vhe-preview-empty">暂无 HTML 可编辑</p>
      </div>

      <aside class="vhe-panel">
        <PropertyPanel
          v-if="mode === 'edit'"
          :selected-element="selectedElement"
          :selected-label="selectedLabel"
          :style-form="styleForm"
          :text-form="textForm"
          :can-edit-text-content="canEditTextContent"
          :can-edit-placeholder="canEditPlaceholder"
          :text-content-label="textContentLabel"
          @apply="applySelectedChanges"
          @reload="reloadSelectedStyle"
        />
        <template v-else>
          <div class="vhe-panel-head">预览</div>
          <div class="vhe-panel-body">
            <p class="vhe-panel-empty">
              当前为预览模式：左侧页面可正常交互（多页切换、按钮、表单等）。<br /><br />
              切回「编辑模式」后可继续点选元素修改，页面状态会保留。
            </p>
            <button
              type="button"
              class="vhe-btn vhe-panel-action"
              :disabled="!frameUrl"
              @click="handleOpenPreviewInNewTab"
            >
              新窗口预览
            </button>
          </div>
        </template>
      </aside>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, toRef, useSlots, watch } from 'vue'
import HtmlImportDialog from './HtmlImportDialog.vue'
import PropertyPanel from './PropertyPanel.vue'
import { useVisualHtmlEditor } from '../composables/useVisualHtmlEditor.js'
import { useVisualHtmlPersistence } from '../composables/useVisualHtmlPersistence.js'
import { createPreviewBlobUrl, revokePreviewBlobUrl } from '../utils/previewFrame.js'

const props = defineProps({
  /** 初始 HTML（非响应式，仅在挂载时加载；换内容请用 ref.reload） */
  initialHtml: {
    type: String,
    default: '',
  },
  /** 工具栏标题，可选 */
  title: {
    type: String,
    default: '',
  },
  /** 默认模式：edit | preview */
  defaultMode: {
    type: String,
    default: 'edit',
    validator: (v) => v === 'edit' || v === 'preview',
  },
  /** 预览 iframe localStorage 隔离作用域，建议传项目 id */
  previewScopeId: {
    type: String,
    default: 'visual-editor',
  },
  /** 保存按钮文案 */
  saveLabel: {
    type: String,
    default: '保存',
  },
  /** 取消/返回按钮文案 */
  cancelLabel: {
    type: String,
    default: '← 返回',
  },
  /** 下载按钮文案，留空则不显示；开启版本条时默认「下载当前版本」 */
  downloadLabel: {
    type: String,
    default: '',
  },
  /** 是否显示下载按钮；默认随 downloadLabel / enableVersionBar 推断，设为 false 可隐藏 */
  showDownloadButton: {
    type: Boolean,
    default: undefined,
  },
  /** 是否显示内部版本切换条 */
  enableVersionBar: {
    type: Boolean,
    default: true,
  },
  /** 编辑模式下未修改时也允许保存（如下载工具） */
  allowSaveWithoutDirty: {
    type: Boolean,
    default: false,
  },
  /**
   * 草稿持久化 key；需同时传入 persistence 适配器才会生效。
   * 宿主项目自行约定格式，例如 tool:fileId / ai:projectId。
   */
  persistKey: {
    type: String,
    default: '',
  },
  /** 草稿展示名称，写入持久化元数据 */
  persistLabel: {
    type: String,
    default: '',
  },
  /**
   * 持久化适配器：{ load(key), save(key, state, meta?), remove?(key) }
   * 由宿主项目注入，组件模块不依赖具体存储实现。
   */
  persistence: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['save', 'cancel', 'dirty-change', 'mode-change', 'download', 'version-change', 'version-create', 'version-delete'])

const slots = useSlots()

const mode = ref(props.defaultMode === 'preview' ? 'preview' : 'edit')
const standalonePreviewUrls = new Set()
const frameUrl = ref('')
const editFrameRef = ref(null)
const changeLogCopied = ref(false)
let changeLogCopiedTimer = 0
let switchingVersion = false
const importVersionDialogVisible = ref(false)

const resolvedDownloadLabel = computed(() => {
  if (props.showDownloadButton === false) return ''
  if (props.downloadLabel) return props.downloadLabel
  if (props.enableVersionBar) return '下载当前版本'
  return ''
})

const {
  documentHtml,
  dirty,
  statusText,
  selectedElement,
  selectedLabel,
  styleForm,
  textForm,
  canEditTextContent,
  canEditPlaceholder,
  textContentLabel,
  applySelectedChanges,
  reloadSelectedStyle,
  clearSelectedStyle,
  loadFromHtml,
  bindFrameDocument,
  attachDocPointerListener,
  teardownFrameBindings,
  onDocRootReady,
  getHtml,
  getActiveVersionHtml,
  reset,
  reload,
  resetBaselineAfterCommit,
  setInteractionEnabled,
  undo,
  redo,
  getEditChangeLogText,
  versions,
  activeVersionId,
  switchVersion,
  saveAsNewVersion,
  importAsNewVersion,
  removeVersion,
  flushCurrentVersionState,
  exportVersionState,
  importVersionState,
} = useVisualHtmlEditor({ enableVersions: props.enableVersionBar })

const {
  loadPersistedState,
  scheduleSave,
  flushSave,
  clearPersisted,
  bindAutoSave,
} = useVisualHtmlPersistence({
  persistKey: toRef(props, 'persistKey'),
  persistLabel: toRef(props, 'persistLabel'),
  persistence: toRef(props, 'persistence'),
  enabled: computed(() => props.enableVersionBar),
  flushState: flushCurrentVersionState,
  exportState: exportVersionState,
})

bindAutoSave(() => [dirty, versions, activeVersionId])

const canSave = computed(() =>
  Boolean(frameUrl.value)
  && (props.allowSaveWithoutDirty || mode.value === 'preview' || dirty.value)
)

watch(dirty, (value) => {
  emit('dirty-change', value)
})

watch(mode, (value) => {
  emit('mode-change', value)
  setInteractionEnabled(value === 'edit')
  if (value === 'preview') {
    statusText.value = '预览模式：可自由操作页面交互'
  } else {
    statusText.value = '编辑模式：点击元素进行修改'
  }
})

function revokeFrameUrl() {
  revokePreviewBlobUrl(frameUrl.value)
  frameUrl.value = ''
}

function refreshFrameUrl() {
  teardownFrameBindings()
  revokeFrameUrl()
  if (!documentHtml.value.trim()) return
  frameUrl.value = createPreviewBlobUrl(documentHtml.value, props.previewScopeId)
}

function handleFrameLoad() {
  const doc = editFrameRef.value?.contentDocument
  // eslint-disable-next-line no-console
  console.debug('[VisualHtmlEditor] frame:load', {
    hasFrame: Boolean(editFrameRef.value),
    hasDoc: Boolean(doc),
    url: doc?.URL || null,
    bodyChildren: doc?.body?.children?.length ?? null,
    mode: mode.value,
  })
  if (!doc?.body) return
  bindFrameDocument(doc)
  attachDocPointerListener(doc)
  onDocRootReady()
  setInteractionEnabled(mode.value === 'edit')
}

watch(documentHtml, () => {
  refreshFrameUrl()
}, { flush: 'post' })

function setMode(nextMode) {
  if (nextMode === mode.value) return
  mode.value = nextMode
}

function handleSave() {
  const html = getActiveVersionHtml()
  if (!html.trim()) return
  if (mode.value === 'edit' && !dirty.value && !props.allowSaveWithoutDirty) return
  emit('save', html, { versionId: activeVersionId.value })
}

function handleDownload() {
  const html = getActiveVersionHtml()
  if (!html.trim()) return
  emit('download', html, { versionId: activeVersionId.value })
}

function revokeStandalonePreviewUrls() {
  for (const url of standalonePreviewUrls) {
    revokePreviewBlobUrl(url)
  }
  standalonePreviewUrls.clear()
}

function handleOpenPreviewInNewTab() {
  const html = getActiveVersionHtml()
  if (!html.trim()) {
    statusText.value = '当前没有可预览的 HTML'
    return
  }

  const url = createPreviewBlobUrl(html, props.previewScopeId)
  if (!url) {
    statusText.value = '无法生成预览内容'
    return
  }

  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) {
    revokePreviewBlobUrl(url)
    statusText.value = '无法打开新窗口，请检查浏览器弹窗拦截设置'
    return
  }

  standalonePreviewUrls.add(url)
  statusText.value = '已在新标签页打开预览'
}

async function handleSaveNewVersion() {
  const entry = await saveAsNewVersion()
  if (!entry) return
  refreshFrameUrl()
  scheduleSave()
  emit('version-create', { versionId: entry.id, versionCount: versions.value.length })
}

function openImportVersionDialog() {
  importVersionDialogVisible.value = true
}

function handleImportVersionError(payload) {
  const message = String(payload?.message || '').trim()
  if (!message) return
  statusText.value = message
}

async function handleImportVersionItems(items) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return

  let lastEntry = null
  for (const item of list) {
    const entry = await importAsNewVersion(item?.html)
    if (!entry) continue
    lastEntry = entry
    emit('version-create', { versionId: entry.id, versionCount: versions.value.length })
  }

  if (!lastEntry) return
  refreshFrameUrl()
  scheduleSave()
}

async function handleRemoveVersion(versionId) {
  if (switchingVersion) return
  switchingVersion = true
  try {
    const result = await removeVersion(versionId)
    if (!result) return
    if (result.switchedTo) {
      refreshFrameUrl()
      emit('version-change', { versionId: activeVersionId.value })
    }
    emit('version-delete', {
      versionId: result.removed.id,
      versionCount: versions.value.length,
      activeVersionId: activeVersionId.value,
    })
    scheduleSave()
  } finally {
    switchingVersion = false
  }
}

async function handleSwitchVersion(versionId) {
  if (switchingVersion || versionId === activeVersionId.value) return
  switchingVersion = true
  try {
    const ok = await switchVersion(versionId)
    if (!ok) return
    refreshFrameUrl()
    emit('version-change', { versionId: activeVersionId.value })
    scheduleSave()
  } finally {
    switchingVersion = false
  }
}

async function handleCopyChangeLog() {
  const text = getEditChangeLogText()
  try {
    await navigator.clipboard.writeText(text)
    changeLogCopied.value = true
    statusText.value = text.includes('暂无检测') ? '当前没有可复制的修改记录' : '修改记录已复制，可粘贴给 AI'
    if (changeLogCopiedTimer) window.clearTimeout(changeLogCopiedTimer)
    changeLogCopiedTimer = window.setTimeout(() => {
      changeLogCopied.value = false
    }, 2000)
  } catch {
    statusText.value = '复制失败，请检查浏览器剪贴板权限'
  }
}

function handleCancel() {
  emit('cancel')
}

const toolbarSlotProps = computed(() => ({
  dirty: dirty.value,
  statusText: statusText.value,
  mode: mode.value,
  canSave: canSave.value,
  frameReady: Boolean(frameUrl.value),
  selectedElement: selectedElement.value,
  onSave: handleSave,
  onCancel: handleCancel,
  onClearStyle: clearSelectedStyle,
  onSetMode: setMode,
  onDownload: handleDownload,
  onOpenPreviewInNewTab: handleOpenPreviewInNewTab,
  onCopyChangeLog: handleCopyChangeLog,
  onSaveNewVersion: handleSaveNewVersion,
  onRemoveVersion: handleRemoveVersion,
  onSwitchVersion: handleSwitchVersion,
  changeLogCopied: changeLogCopied.value,
  downloadLabel: resolvedDownloadLabel.value,
  versions: versions.value,
  activeVersionId: activeVersionId.value,
  enableVersionBar: props.enableVersionBar,
}))

onMounted(async () => {
  let restored = false
  const persisted = loadPersistedState()
  if (persisted && importVersionState(persisted)) {
    const html = versions.value.find((item) => item.id === activeVersionId.value)?.savedHtml
      || props.initialHtml
    await loadFromHtml(html, { initializeVersions: false, resetHistory: false })
    restored = true
  }

  if (!restored) {
    await loadFromHtml(props.initialHtml, { initializeVersions: props.enableVersionBar })
  }

  refreshFrameUrl()
  setInteractionEnabled(mode.value === 'edit')
  if (mode.value === 'preview') {
    statusText.value = '预览模式：可自由操作页面交互'
  }
})

onBeforeUnmount(() => {
  flushSave()
  if (changeLogCopiedTimer) window.clearTimeout(changeLogCopiedTimer)
  teardownFrameBindings()
  revokeFrameUrl()
  revokeStandalonePreviewUrls()
})

defineExpose({
  getHtml,
  getActiveVersionHtml,
  reset: async () => {
    await reset()
    refreshFrameUrl()
  },
  reload: async (html) => {
    await reload(html)
    refreshFrameUrl()
  },
  resetBaselineAfterCommit,
  undo,
  redo,
  dirty,
  mode,
  setMode,
  openPreviewInNewTab: handleOpenPreviewInNewTab,
  getEditChangeLogText,
  versions,
  activeVersionId,
  switchVersion: async (versionId) => {
    await handleSwitchVersion(versionId)
  },
  saveAsNewVersion: async () => {
    await handleSaveNewVersion()
  },
  importAsNewVersion: async (html) => {
    const entry = await importAsNewVersion(html)
    if (!entry) return null
    refreshFrameUrl()
    scheduleSave()
    emit('version-create', { versionId: entry.id, versionCount: versions.value.length })
    return entry
  },
  removeVersion: async (versionId) => {
    await handleRemoveVersion(versionId)
  },
  clearPersistedDraft: clearPersisted,
  flushPersistedDraft: flushSave,
})
</script>

<style scoped>
.vhe-editor-page {
  --vhe-bg: var(--color-background, #f8fafc);
  --vhe-text: var(--hh-text, #0f172a);
  --vhe-text-2: var(--hh-text-2, #475569);
  --vhe-text-3: var(--hh-text-3, #64748b);
  --vhe-border: var(--hh-border, #e2e8f0);
  --vhe-border-2: var(--hh-border-2, #cbd5e1);
  --vhe-surface: var(--hh-surface-solid, #ffffff);
  --vhe-brand: var(--hh-brand, #7c3aed);
  --vhe-brand-rgb: var(--hh-brand-rgb, 124 58 237);
  --vhe-shadow: var(--hh-shadow-md, 0 4px 12px rgb(15 23 42 / 0.08));

  height: calc(100dvh - var(--hh-top-nav-height, 64px));
  max-height: calc(100dvh - var(--hh-top-nav-height, 64px));
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--vhe-bg);
  color: var(--vhe-text);
  overflow: hidden;
}

.vhe-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background: color-mix(in srgb, var(--vhe-surface) 88%, transparent);
  border-bottom: 1px solid var(--vhe-border);
  flex-shrink: 0;
}

.vhe-toolbar-default {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  width: 100%;
  min-width: 0;
}

.vhe-toolbar-leading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
  min-width: 0;
}

.vhe-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  flex: 0 1 auto;
  margin-left: auto;
}

.vhe-toolbar-actions .vhe-status {
  margin-left: auto;
}

.vhe-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.vhe-btn {
  padding: 7px 14px;
  border: 1px solid var(--vhe-border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--vhe-surface) 92%, #000 0%);
  color: var(--vhe-text);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.vhe-btn:hover:not(:disabled) {
  background: rgb(var(--vhe-brand-rgb) / 0.08);
}

.vhe-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.vhe-btn-primary {
  background: color-mix(in srgb, var(--vhe-brand) 86%, #000 0%);
  border-color: rgb(var(--vhe-brand-rgb) / 0.45);
  color: #fff;
}

.vhe-btn-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--vhe-brand) 92%, #000 0%);
}

.vhe-mode-switch {
  display: inline-flex;
  border: 1px solid var(--vhe-border);
  border-radius: 6px;
  overflow: hidden;
}

.vhe-mode-btn {
  padding: 7px 12px;
  border: none;
  background: color-mix(in srgb, var(--vhe-surface) 92%, #000 0%);
  color: var(--vhe-text-2);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.vhe-mode-btn + .vhe-mode-btn {
  border-left: 1px solid var(--vhe-border);
}

.vhe-mode-btn.active {
  background: rgb(var(--vhe-brand-rgb) / 0.12);
  color: var(--vhe-brand);
  font-weight: 600;
}

.vhe-status {
  margin-left: auto;
  font-size: 12px;
  color: var(--vhe-text-2);
}

.vhe-version-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  padding: 6px 20px;
  background: color-mix(in srgb, var(--vhe-surface) 94%, transparent);
  border-bottom: 1px solid var(--vhe-border);
  flex-shrink: 0;
  min-width: 0;
}

.vhe-version-bar-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--vhe-text-2);
}

.vhe-version-tabs {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  flex: 1 1 auto;
  min-width: 0;
}

.vhe-version-chip {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--vhe-border);
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--vhe-surface) 92%, #000 0%);
}

.vhe-version-chip.active {
  border-color: rgb(var(--vhe-brand-rgb) / 0.45);
  background: rgb(var(--vhe-brand-rgb) / 0.12);
}

.vhe-version-tab {
  min-width: 64px;
  padding: 6px 16px 6px 20px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--vhe-text-2);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
}

.vhe-version-chip.active .vhe-version-tab {
  color: var(--vhe-brand);
  font-weight: 600;
}

.vhe-version-chip:not(.active) .vhe-version-tab {
  padding: 6px 20px;
}

.vhe-version-tab:hover {
  color: var(--vhe-brand);
}

.vhe-version-tab-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  padding: 0;
  border: none;
  border-left: 1px solid var(--vhe-border);
  background: transparent;
  color: var(--vhe-text-3);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  line-height: 1;
}

.vhe-version-chip.active .vhe-version-tab-remove {
  border-left-color: rgb(var(--vhe-brand-rgb) / 0.25);
}

.vhe-version-tab-remove:hover:not(:disabled) {
  background: rgb(239 68 68 / 0.12);
  color: #dc2626;
}

.vhe-version-tab-remove:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.vhe-version-tab-add {
  min-width: 56px;
  padding: 6px 16px;
  border: 1px solid var(--vhe-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vhe-surface) 92%, #000 0%);
  color: var(--vhe-text-2);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
}

.vhe-version-tab-add:hover:not(:disabled) {
  border-color: rgb(var(--vhe-brand-rgb) / 0.35);
  color: var(--vhe-brand);
}

.vhe-version-tab-upload {
  min-width: auto;
  padding: 6px 14px;
  border: 1px solid var(--vhe-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vhe-surface) 92%, #000 0%);
  color: var(--vhe-text-2);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

.vhe-version-tab-upload:hover:not(:disabled) {
  border-color: rgb(var(--vhe-brand-rgb) / 0.35);
  color: var(--vhe-brand);
}

.vhe-version-hint {
  margin-left: auto;
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--vhe-text-3);
}

.vhe-main {
  flex: 1 1 0;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

.vhe-viewport-area {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: #fff;
  border-right: 1px solid var(--vhe-border);
}

.vhe-doc-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background: #fff;
}

.vhe-preview-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--vhe-text-3);
  font-size: 14px;
}

.vhe-panel {
  width: 320px;
  flex-shrink: 0;
  background: var(--vhe-surface);
  border-left: 1px solid var(--vhe-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.vhe-panel-head {
  padding: 14px 16px;
  border-bottom: 1px solid var(--vhe-border);
  font-size: 13px;
  font-weight: 600;
}

.vhe-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 20px;
}

.vhe-panel-empty {
  color: var(--vhe-text-2);
  font-size: 13px;
  line-height: 1.6;
}

.vhe-panel-action {
  margin-top: 14px;
  width: 100%;
}

@media (max-width: 960px) {
  .vhe-main {
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
  }

  .vhe-viewport-area {
    flex: 1 1 0;
    min-height: 0;
    border-right: none;
    border-bottom: 1px solid var(--vhe-border);
  }

  .vhe-panel {
    flex: 0 1 auto;
    width: 100%;
    max-height: min(40vh, 280px);
    border-left: none;
    border-top: none;
  }

  .vhe-version-hint {
    flex-basis: 100%;
    margin-left: 0;
    text-align: right;
  }
}
</style>
