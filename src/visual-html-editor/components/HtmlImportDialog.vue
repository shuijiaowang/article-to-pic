<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="vhe-import-dialog-backdrop"
      @click.self="close"
    >
      <div
        class="vhe-import-dialog"
        role="dialog"
        :aria-labelledby="titleId"
        aria-modal="true"
      >
        <header class="vhe-import-dialog-head">
          <h2 :id="titleId" class="vhe-import-dialog-title">{{ title }}</h2>
          <button type="button" class="vhe-import-dialog-close" aria-label="关闭" @click="close">×</button>
        </header>

        <div class="vhe-import-dialog-body">
          <HtmlImportPanel
            ref="panelRef"
            v-model:file-name="fileName"
            v-model:html-text="htmlText"
            :hint="hint"
            :max-file-bytes="maxFileBytes"
            :allow-multiple="allowMultiple"
            :show-file-name-field="showFileNameField"
            @import-items="onImportItems"
            @error="onPanelError"
          />
        </div>

        <footer class="vhe-import-dialog-foot">
          <button type="button" class="vhe-btn" @click="close">{{ cancelLabel }}</button>
          <button
            type="button"
            class="vhe-btn vhe-btn-primary"
            :disabled="!htmlText.trim()"
            @click="confirmPaste"
          >
            {{ confirmLabel }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, useId, watch } from 'vue'
import HtmlImportPanel from './HtmlImportPanel.vue'

const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  title: {
    type: String,
    default: '导入 HTML',
  },
  hint: {
    type: String,
    default: '',
  },
  cancelLabel: {
    type: String,
    default: '取消',
  },
  confirmLabel: {
    type: String,
    default: '确认',
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
})

const emit = defineEmits(['update:modelValue', 'import-items', 'error'])

const titleId = `vhe-import-dialog-title-${useId()}`
const panelRef = ref(null)
const fileName = ref('粘贴.html')
const htmlText = ref('')

function resetDialog() {
  fileName.value = '粘贴.html'
  htmlText.value = ''
  panelRef.value?.reset?.()
}

function close() {
  emit('update:modelValue', false)
}

function onImportItems(items) {
  emit('import-items', items)
  close()
}

function onPanelError(payload) {
  emit('error', payload)
}

function confirmPaste() {
  const ok = panelRef.value?.confirmPaste?.()
  if (ok) {
    close()
  }
}

watch(() => props.modelValue, (visible) => {
  if (!visible) {
    resetDialog()
  }
})
</script>

<style scoped>
.vhe-import-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgb(15 23 42 / 0.45);
}

.vhe-import-dialog {
  width: min(720px, 92vw);
  max-height: min(90vh, 900px);
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  border: 1px solid var(--vhe-border, var(--hh-border, #e2e8f0));
  background: var(--vhe-surface, var(--hh-surface-solid, #fff));
  box-shadow: var(--vhe-shadow, var(--hh-shadow-md, 0 12px 32px rgb(15 23 42 / 0.18)));
  overflow: hidden;
}

.vhe-import-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--vhe-border, var(--hh-border, #e2e8f0));
}

.vhe-import-dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--vhe-text, var(--hh-text, #0f172a));
}

.vhe-import-dialog-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--vhe-text-2, var(--hh-text-2, #475569));
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
}

.vhe-import-dialog-close:hover {
  background: rgb(var(--vhe-brand-rgb, var(--hh-brand-rgb, 124 58 237)) / 0.08);
  color: var(--vhe-text, var(--hh-text, #0f172a));
}

.vhe-import-dialog-body {
  padding: 16px 18px;
  overflow: auto;
}

.vhe-import-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--vhe-border, var(--hh-border, #e2e8f0));
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

.vhe-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.vhe-btn-primary {
  border-color: rgb(var(--vhe-brand-rgb, var(--hh-brand-rgb, 124 58 237)) / 0.35);
  background: var(--vhe-brand, var(--hh-brand, #7c3aed));
  color: #fff;
}

.vhe-btn-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--vhe-brand, var(--hh-brand, #7c3aed)) 88%, #000);
}
</style>
