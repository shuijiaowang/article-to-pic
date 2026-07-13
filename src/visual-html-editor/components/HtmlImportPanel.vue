<template>
  <div class="vhe-import-panel">
    <p v-if="hint" class="vhe-import-hint">{{ hint }}</p>

    <input
      ref="fileInputRef"
      class="vhe-import-file-input"
      type="file"
      accept=".html,text/html"
      :multiple="allowMultiple"
      @change="onFileInputChange"
    >

    <div
      class="vhe-import-drop-zone"
      :class="{ 'vhe-import-drop-zone--active': dragOver }"
      role="button"
      tabindex="0"
      aria-label="拖拽或点击上传 HTML 文件"
      @click="openFilePicker"
      @keydown.enter.prevent="openFilePicker"
      @keydown.space.prevent="openFilePicker"
      @dragenter.prevent="dragOver = true"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <span class="vhe-import-drop-icon" aria-hidden="true">📄</span>
      <span class="vhe-import-drop-title">拖拽 HTML 文件到此处</span>
      <span class="vhe-import-drop-desc">或点击选择文件 · 单个文件不超过 {{ formatBytes(maxFileBytes) }}</span>
    </div>

    <div class="vhe-import-divider">或粘贴源代码</div>

    <div class="vhe-import-paste">
      <template v-if="showFileNameField">
        <label class="vhe-import-label" :for="fileNameInputId">文件名</label>
        <input
          :id="fileNameInputId"
          v-model="fileNameModel"
          class="vhe-import-name-input"
          type="text"
          placeholder="粘贴.html"
        >
      </template>
      <div class="vhe-import-paste-toolbar">
        <label class="vhe-import-label" :for="sourceInputId">HTML 源代码</label>
        <button type="button" class="vhe-btn vhe-import-toolbar-btn" @click="pasteFromClipboard">从剪贴板粘贴</button>
      </div>
      <textarea
        :id="sourceInputId"
        v-model="htmlTextModel"
        class="vhe-import-textarea"
        rows="12"
        placeholder="粘贴完整 HTML（含 &lt;html&gt;、&lt;head&gt;、&lt;body&gt; 及闭合标签）"
        @paste="onPasteNative"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, useId } from 'vue'
import { formatBytes } from '../utils/formatBytes.js'
import { validateFullHTMLStructure } from '../utils/htmlValidation.js'

const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024

const props = defineProps({
  hint: {
    type: String,
    default: '支持拖拽或选择 .html 文件，也可在下方粘贴完整 HTML 源代码。',
  },
  maxFileBytes: {
    type: Number,
    default: DEFAULT_MAX_FILE_BYTES,
  },
  allowMultiple: {
    type: Boolean,
    default: true,
  },
  showFileNameField: {
    type: Boolean,
    default: true,
  },
  fileName: {
    type: String,
    default: '粘贴.html',
  },
  htmlText: {
    type: String,
    default: '',
  },
})

const emit = defineEmits([
  'update:fileName',
  'update:htmlText',
  'import-items',
  'error',
])

const uid = useId()
const fileNameInputId = `vhe-import-name-${uid}`
const sourceInputId = `vhe-import-source-${uid}`

const fileInputRef = ref(null)
const dragOver = ref(false)

const fileNameModel = computed({
  get: () => props.fileName,
  set: (value) => emit('update:fileName', value),
})

const htmlTextModel = computed({
  get: () => props.htmlText,
  set: (value) => emit('update:htmlText', value),
})

function isHtmlFile(file) {
  if (!file) return false
  const name = file.name.toLowerCase()
  return name.endsWith('.html') || file.type === 'text/html'
}

async function readValidatedFiles(files) {
  const fileList = Array.from(files || [])
  if (!fileList.length) return []

  const items = []
  for (const file of fileList) {
    if (!isHtmlFile(file)) {
      emit('error', { message: `${file.name} 不是 HTML 文件，已跳过` })
      continue
    }
    if (file.size > props.maxFileBytes) {
      emit('error', { message: `${file.name} 超过 ${formatBytes(props.maxFileBytes)}，已跳过` })
      continue
    }

    const text = await file.text()
    const structureCheck = validateFullHTMLStructure(text)
    if (!structureCheck.ok) {
      emit('error', { message: `${file.name}：${structureCheck.message}` })
      continue
    }

    items.push({ name: file.name, html: text })
  }

  return items
}

async function emitValidatedFiles(files) {
  const items = await readValidatedFiles(files)
  if (!items.length) return 0
  emit('import-items', items)
  return items.length
}

function openFilePicker() {
  fileInputRef.value?.click()
}

async function onFileInputChange(event) {
  const added = await emitValidatedFiles(event.target.files)
  event.target.value = ''
  return added
}

function onDragLeave(event) {
  if (event.currentTarget?.contains(event.relatedTarget)) return
  dragOver.value = false
}

async function onDrop(event) {
  dragOver.value = false
  const files = event.dataTransfer?.files
  if (!files?.length) return

  const htmlFiles = Array.from(files).filter(isHtmlFile)
  if (!htmlFiles.length) {
    emit('error', { message: '请拖入 .html 文件' })
    return
  }

  await emitValidatedFiles(htmlFiles)
}

async function pasteFromClipboard() {
  try {
    htmlTextModel.value = await navigator.clipboard.readText()
  } catch {
    emit('error', { message: '粘贴失败：无法读取剪贴板，请检查权限或在内置浏览器中重试' })
  }
}

function onPasteNative(event) {
  const text = event.clipboardData?.getData('text/plain')
  if (text === undefined || text === '') return
  event.preventDefault()
  const el = event.target
  const start = el.selectionStart
  const end = el.selectionEnd
  const prev = htmlTextModel.value
  htmlTextModel.value = prev.slice(0, start) + text + prev.slice(end)
}

function buildPasteItem() {
  const text = String(htmlTextModel.value || '').trim()
  if (!text) {
    emit('error', { message: '请粘贴 HTML 内容' })
    return null
  }

  const structureCheck = validateFullHTMLStructure(text)
  if (!structureCheck.ok) {
    emit('error', { message: structureCheck.message })
    return null
  }

  const name = String(fileNameModel.value || '').trim() || '粘贴.html'
  return { name, html: text }
}

function confirmPaste() {
  const item = buildPasteItem()
  if (!item) return false
  emit('import-items', [item])
  return true
}

function reset() {
  dragOver.value = false
  fileNameModel.value = '粘贴.html'
  htmlTextModel.value = ''
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

defineExpose({
  confirmPaste,
  reset,
  openFilePicker,
})
</script>

<style scoped>
.vhe-import-hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: var(--vhe-text-2, var(--hh-text-2, #475569));
  line-height: 1.5;
}

.vhe-import-file-input {
  display: none;
}

.vhe-import-drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 28px 16px;
  border: 1.5px dashed var(--vhe-border, var(--hh-border, #e2e8f0));
  border-radius: 10px;
  background: color-mix(in srgb, var(--vhe-surface, var(--hh-surface-solid, #fff)) 96%, #000 0%);
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s, background 0.15s;
}

.vhe-import-drop-zone:hover,
.vhe-import-drop-zone:focus-visible {
  border-color: rgb(var(--vhe-brand-rgb, var(--hh-brand-rgb, 124 58 237)) / 0.45);
  background: rgb(var(--vhe-brand-rgb, var(--hh-brand-rgb, 124 58 237)) / 0.04);
  outline: none;
}

.vhe-import-drop-zone--active {
  border-color: var(--vhe-brand, var(--hh-brand, #7c3aed));
  background: rgb(var(--vhe-brand-rgb, var(--hh-brand-rgb, 124 58 237)) / 0.08);
}

.vhe-import-drop-icon {
  font-size: 28px;
  line-height: 1;
}

.vhe-import-drop-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--vhe-text, var(--hh-text, #0f172a));
}

.vhe-import-drop-desc {
  font-size: 12px;
  color: var(--vhe-text-2, var(--hh-text-2, #475569));
}

.vhe-import-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 0 14px;
  font-size: 12px;
  color: var(--vhe-text-2, var(--hh-text-2, #475569));
}

.vhe-import-divider::before,
.vhe-import-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--vhe-border, var(--hh-border, #e2e8f0));
}

.vhe-import-paste {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vhe-import-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--vhe-text-2, var(--hh-text-2, #475569));
}

.vhe-import-name-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--vhe-border, var(--hh-border, #e2e8f0));
  border-radius: 6px;
  background: var(--vhe-surface, var(--hh-surface-solid, #fff));
  color: var(--vhe-text, var(--hh-text, #0f172a));
  font: inherit;
  font-size: 13px;
}

.vhe-import-paste-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.vhe-import-toolbar-btn {
  padding: 5px 10px;
  font-size: 12px;
}

.vhe-import-textarea {
  width: 100%;
  min-height: 200px;
  padding: 10px 12px;
  border: 1px solid var(--vhe-border, var(--hh-border, #e2e8f0));
  border-radius: 8px;
  background: var(--vhe-surface, var(--hh-surface-solid, #fff));
  color: var(--vhe-text, var(--hh-text, #0f172a));
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
}

.vhe-btn {
  padding: 7px 14px;
  border: 1px solid var(--vhe-border, var(--hh-border, #e2e8f0));
  border-radius: 6px;
  background: color-mix(in srgb, var(--vhe-surface, var(--hh-surface-solid, #fff)) 92%, #000 0%);
  color: var(--vhe-text, var(--hh-text, #0f172a));
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.vhe-btn:hover:not(:disabled) {
  background: rgb(var(--vhe-brand-rgb, var(--hh-brand-rgb, 124 58 237)) / 0.08);
}
</style>
