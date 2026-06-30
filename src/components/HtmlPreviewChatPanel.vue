<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ChatSessionSummary } from '@/storage/chat-history'

const STORAGE_KEY = 'article-to-pic:chat-panel-width'
const DEFAULT_WIDTH = 520
const MIN_WIDTH = 320
const MAX_WIDTH = 960
const LEGACY_DEFAULT_WIDTH = 360

function loadPanelWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_WIDTH
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n)) return DEFAULT_WIDTH
    if (n === LEGACY_DEFAULT_WIDTH) {
      const width = clampWidth(DEFAULT_WIDTH)
      savePanelWidth(width)
      return width
    }
    return clampWidth(n)
  } catch {
    return DEFAULT_WIDTH
  }
}

function savePanelWidth(width: number) {
  localStorage.setItem(STORAGE_KEY, String(width))
}

function clampWidth(width: number) {
  const maxByViewport = Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.7))
  return Math.min(MAX_WIDTH, maxByViewport, Math.max(MIN_WIDTH, width))
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** 完整 AI 响应 JSON，不在界面展示 */
  rawResponse?: string
}

const props = defineProps<{
  messages: ChatMessage[]
  sessions?: ChatSessionSummary[]
  activeSessionId?: string | null
  disabled?: boolean
  busy?: boolean
}>()

const emit = defineEmits<{
  send: [message: string]
  'select-session': [sessionId: string]
  'new-session': []
}>()

const input = ref('')
const listRef = ref<HTMLElement | null>(null)
const panelWidth = ref(loadPanelWidth())
const resizing = ref(false)
const historyOpen = ref(false)
const historyRef = ref<HTMLElement | null>(null)

const sortedSessions = computed(() =>
  [...(props.sessions ?? [])].sort((a, b) => b.updatedAt - a.updatedAt),
)

let resizeCleanup: (() => void) | undefined

function startResize(event: MouseEvent) {
  event.preventDefault()
  if (resizeCleanup) resizeCleanup()

  resizing.value = true
  const startX = event.clientX
  const startWidth = panelWidth.value

  function onMove(e: MouseEvent) {
    panelWidth.value = clampWidth(startWidth + startX - e.clientX)
  }

  function onUp() {
    resizing.value = false
    savePanelWidth(panelWidth.value)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    resizeCleanup = undefined
  }

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
  resizeCleanup = onUp
}

onUnmounted(() => {
  resizeCleanup?.()
  window.removeEventListener('resize', onWindowResize)
  document.removeEventListener('click', onDocumentClick)
})

function onWindowResize() {
  const clamped = clampWidth(panelWidth.value)
  if (clamped !== panelWidth.value) {
    panelWidth.value = clamped
    savePanelWidth(clamped)
  }
}

function onDocumentClick(event: MouseEvent) {
  if (!historyOpen.value) return
  const target = event.target as Node | null
  if (historyRef.value && target && !historyRef.value.contains(target)) {
    historyOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('resize', onWindowResize)
  document.addEventListener('click', onDocumentClick)
})

function toggleHistory() {
  historyOpen.value = !historyOpen.value
}

function pickSession(sessionId: string) {
  historyOpen.value = false
  emit('select-session', sessionId)
}

function startNewSession() {
  historyOpen.value = false
  emit('new-session')
}

function formatSessionTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

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
  <aside
    class="chat-panel"
    :class="{ resizing }"
    :style="{ width: `${panelWidth}px` }"
  >
    <div
      class="chat-resize-handle"
      title="拖拽调整宽度"
      @mousedown="startResize"
    />
    <div class="chat-panel-head">
      <div class="chat-panel-head-row">
        <span class="chat-panel-title">AI 助手</span>
        <div ref="historyRef" class="chat-head-actions">
          <button
            type="button"
            class="chat-head-btn"
            title="新建对话"
            :disabled="busy"
            @click="startNewSession"
          >
            新对话
          </button>
          <button
            type="button"
            class="chat-head-btn"
            :class="{ active: historyOpen }"
            title="历史对话"
            @click.stop="toggleHistory"
          >
            历史对话
          </button>
          <div v-if="historyOpen" class="chat-history-menu">
            <p v-if="sortedSessions.length === 0" class="chat-history-empty">暂无历史对话</p>
            <button
              v-for="session in sortedSessions"
              :key="session.id"
              type="button"
              class="chat-history-item"
              :class="{ active: session.id === activeSessionId }"
              @click="pickSession(session.id)"
            >
              <span class="chat-history-title">{{ session.title }}</span>
              <span class="chat-history-time">{{ formatSessionTime(session.updatedAt) }}</span>
            </button>
          </div>
        </div>
      </div>
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
        rows="5"
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
  position: relative;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-left: 1px solid #e5e5ea;
  min-height: 0;
}

.chat-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 8px;
  margin-left: -4px;
  cursor: col-resize;
  z-index: 2;
  touch-action: none;
}

.chat-resize-handle::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 32px;
  border-radius: 1px;
  background: transparent;
  transition: background 0.15s;
}

.chat-resize-handle:hover::after,
.chat-panel.resizing .chat-resize-handle::after {
  background: #7c3aed;
}

.chat-panel-head {
  padding: 14px 16px;
  border-bottom: 1px solid #e5e5ea;
  flex-shrink: 0;
}

.chat-panel-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.chat-panel-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
}

.chat-head-actions {
  position: relative;
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.chat-head-btn {
  padding: 4px 10px;
  border: 1px solid #e5e5ea;
  border-radius: 6px;
  background: #fafafa;
  color: #555;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.chat-head-btn:hover:not(:disabled) {
  background: #f0f0f0;
  border-color: #d4d4d8;
}

.chat-head-btn.active {
  background: #ede9fe;
  border-color: #7c3aed;
  color: #5b21b6;
}

.chat-head-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.chat-history-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  width: min(280px, calc(100vw - 32px));
  max-height: 320px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid #e5e5ea;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.chat-history-empty {
  margin: 0;
  padding: 12px 10px;
  font-size: 13px;
  color: #888;
  text-align: center;
}

.chat-history-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #333;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.chat-history-item:hover {
  background: #f4f4f5;
}

.chat-history-item.active {
  background: #ede9fe;
  color: #5b21b6;
}

.chat-history-title {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.chat-history-time {
  font-size: 11px;
  color: #888;
}

.chat-history-item.active .chat-history-time {
  color: #7c3aed;
}

.chat-panel-hint {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: #888;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  min-height: 0;
}

.chat-empty {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: #888;
}

.chat-msg {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.6;
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

.chat-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 14px 10px;
  flex-shrink: 0;
}

.chat-suggestion {
  padding: 6px 12px;
  border: 1px solid #e5e5ea;
  border-radius: 999px;
  background: #fafafa;
  color: #555;
  font: inherit;
  font-size: 12px;
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
  padding: 12px 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
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
  padding: 9px 20px;
  border: none;
  border-radius: 8px;
  background: #7c3aed;
  color: #fff;
  font: inherit;
  font-size: 14px;
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
