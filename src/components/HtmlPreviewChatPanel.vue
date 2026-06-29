<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  changed?: boolean
}

const props = defineProps<{
  messages: ChatMessage[]
  disabled?: boolean
  busy?: boolean
}>()

const emit = defineEmits<{
  send: [message: string]
}>()

const input = ref('')
const listRef = ref<HTMLElement | null>(null)

const suggestions = [
  '哪几页内容溢出了？',
  '修复所有页面溢出',
  '把封面标题字号加大一点',
  '正文段落行距调宽松',
]

watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
  },
)

function submit() {
  const text = input.value.trim()
  if (!text || props.disabled || props.busy) return
  emit('send', text)
  input.value = ''
}

function useSuggestion(text: string) {
  if (props.disabled || props.busy) return
  emit('send', text)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    submit()
  }
}
</script>

<template>
  <aside class="chat-panel">
    <div class="chat-panel-head">
      <span class="chat-panel-title">AI 助手</span>
      <span class="chat-panel-hint">描述修改或提问</span>
    </div>

    <div ref="listRef" class="chat-messages">
      <p v-if="messages.length === 0" class="chat-empty">
        用自然语言描述想要的改动，或直接提问。<br /><br />
        例如：「把第 2 页标题改大」「修复溢出」「封面副标题改成…」
      </p>
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="chat-msg"
        :class="msg.role"
      >
        <span class="chat-msg-role">{{ msg.role === 'user' ? '你' : 'AI' }}</span>
        <p class="chat-msg-text">{{ msg.content }}</p>
        <span v-if="msg.changed" class="chat-msg-badge">已应用修改</span>
      </div>
      <div v-if="busy" class="chat-msg assistant pending">
        <span class="chat-msg-role">AI</span>
        <p class="chat-msg-text">正在分析并处理…</p>
      </div>
    </div>

    <div v-if="!disabled" class="chat-suggestions">
      <button
        v-for="item in suggestions"
        :key="item"
        type="button"
        class="chat-suggestion"
        :disabled="busy"
        @click="useSuggestion(item)"
      >
        {{ item }}
      </button>
    </div>

    <div class="chat-input-wrap">
      <textarea
        v-model="input"
        class="chat-input"
        rows="3"
        placeholder="描述修改或提问…（Ctrl+Enter 发送）"
        :disabled="disabled || busy"
        @keydown="onKeydown"
      />
      <button
        type="button"
        class="chat-send"
        :disabled="disabled || busy || !input.trim()"
        @click="submit"
      >
        {{ busy ? '处理中…' : '发送' }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.chat-panel {
  width: 360px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-left: 1px solid #e5e5ea;
  min-height: 0;
}

.chat-panel-head {
  padding: 14px 16px;
  border-bottom: 1px solid #e5e5ea;
  flex-shrink: 0;
}

.chat-panel-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
}

.chat-panel-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: #888;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  min-height: 0;
}

.chat-empty {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #888;
}

.chat-msg {
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.55;
}

.chat-msg.user {
  background: #ede9fe;
  color: #4c1d95;
  margin-left: 12px;
}

.chat-msg.assistant {
  background: #f4f4f5;
  color: #27272a;
  margin-right: 12px;
}

.chat-msg.pending {
  opacity: 0.75;
}

.chat-msg-role {
  display: block;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
  opacity: 0.65;
}

.chat-msg-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-msg-badge {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  font-size: 11px;
}

.chat-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 14px 10px;
  flex-shrink: 0;
}

.chat-suggestion {
  padding: 5px 10px;
  border: 1px solid #e5e5ea;
  border-radius: 999px;
  background: #fafafa;
  color: #555;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.chat-suggestion:hover:not(:disabled) {
  background: #f0f0f0;
  border-color: #d4d4d8;
}

.chat-suggestion:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.chat-input-wrap {
  padding: 12px 14px 14px;
  border-top: 1px solid #e5e5ea;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  resize: none;
  color: #1a1a1a;
}

.chat-input:focus {
  outline: none;
  border-color: #7c3aed;
  box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.12);
}

.chat-input:disabled {
  background: #f9f9f9;
  color: #aaa;
}

.chat-send {
  align-self: flex-end;
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  background: #7c3aed;
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.chat-send:hover:not(:disabled) {
  background: #6d28d9;
}

.chat-send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
