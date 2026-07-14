<script setup lang="ts">
import { computed, ref, toRef } from 'vue'
import AiChatPanel from './AiChatPanel.vue'
import { useHtmlAiChat } from '../composables/useHtmlAiChat'
import { useHtmlAiLayoutFix } from '../composables/useHtmlAiLayoutFix'
import type { HtmlAiChatHtmlUpdatedPayload } from '../types'

const props = defineProps<{
  articleId: string
  html: string
  docElement: HTMLElement | null
  fileName: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'html-updated': [payload: HtmlAiChatHtmlUpdatedPayload]
  'status-change': [message: string, warn?: boolean]
  error: [message: string]
}>()

const chatPanelRef = ref<InstanceType<typeof AiChatPanel> | null>(null)

const aiCallbacks = {
  onAiNotConfigured: () => chatPanelRef.value?.openConfigDialog(),
  onStatus: (message: string, warn?: boolean) => emit('status-change', message, warn),
  onError: (message: string) => emit('error', message),
  onHtmlUpdated: (payload: HtmlAiChatHtmlUpdatedPayload) => emit('html-updated', payload),
}

const { optimizing, runLayoutFix } = useHtmlAiLayoutFix({
  getHtml: () => props.html,
  getDocElement: () => props.docElement,
  getFileName: () => props.fileName,
  blocked: () => chatBusy.value,
  ...aiCallbacks,
})

const {
  busy: chatBusy,
  messages,
  sessions,
  activeSessionId,
  send,
  selectSession,
  newSession,
} = useHtmlAiChat({
  articleId: toRef(props, 'articleId'),
  getHtml: () => props.html,
  getDocElement: () => props.docElement,
  getFileName: () => props.fileName,
  disabled: toRef(props, 'disabled'),
  blocked: () => optimizing.value,
  ...aiCallbacks,
})

const processing = computed(() => chatBusy.value || optimizing.value)
</script>

<template>
  <AiChatPanel
    ref="chatPanelRef"
    :messages="messages"
    :sessions="sessions"
    :active-session-id="activeSessionId"
    :disabled="disabled"
    :busy="processing"
    :layout-fixing="optimizing"
    @send="send"
    @select-session="selectSession"
    @new-session="newSession"
    @layout-fix="runLayoutFix"
  />
</template>
