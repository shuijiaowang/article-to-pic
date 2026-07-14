<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { createPreviewBlobUrl, revokePreviewBlobUrl } from '@/visual-html-editor'
import { bindPreviewPageLayout, teardownPreviewPageLayout } from '@/utils/texttopic/preview-page-layout'

const props = defineProps<{
  html: string
  scopeId: string
}>()

const emit = defineEmits<{
  load: [doc: Document]
  error: [message: string]
}>()

const frameRef = ref<HTMLIFrameElement | null>(null)
const frameUrl = ref('')

function revokeFrameUrl() {
  revokePreviewBlobUrl(frameUrl.value)
  frameUrl.value = ''
}

function refreshFrameUrl() {
  revokeFrameUrl()
  const html = props.html.trim()
  if (!html) return
  frameUrl.value = createPreviewBlobUrl(html, props.scopeId)
}

function handleFrameLoad() {
  const doc = frameRef.value?.contentDocument
  if (!doc?.body) return

  const docRoot = doc.getElementById('doc')
  if (!docRoot) {
    emit('error', '未找到 #doc，请确认是 TextToPic 模板 HTML')
    return
  }

  bindPreviewPageLayout(doc)
  emit('load', doc)
}

watch(
  () => [props.html, props.scopeId] as const,
  () => {
    teardownPreviewPageLayout()
    refreshFrameUrl()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  teardownPreviewPageLayout()
  revokeFrameUrl()
})
</script>

<template>
  <iframe
    ref="frameRef"
    class="html-preview-frame"
    :src="frameUrl || undefined"
    sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
    title="HTML 预览"
    @load="handleFrameLoad"
  />
</template>

<style scoped>
.html-preview-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
  background: #e8e8e8;
}
</style>
