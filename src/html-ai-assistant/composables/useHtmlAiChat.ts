import { ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { isAiReady } from '@/ai'
import { editHtmlWithChat } from '@/services/ai-html'
import { generateLayoutReport } from '@/utils/texttopic/layout-report'
import {
  buildChatTurnHistory,
  createChatSession,
  getActiveChatSessionId,
  getChatSession,
  getChatSessionSummaries,
  saveChatSession,
  setActiveChatSessionId,
} from '../storage/chat-history'
import type { ChatMessage, ChatSession, HtmlAiChatHtmlUpdatedPayload } from '../types'

function nextChatId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function formatVersionLabel(prefix: string) {
  const time = new Date().toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${prefix} ${time}`
}

export interface UseHtmlAiChatOptions {
  articleId: MaybeRefOrGetter<string>
  getHtml: () => string
  getDocElement: () => HTMLElement | null
  getFileName: () => string
  disabled?: MaybeRefOrGetter<boolean>
  blocked?: MaybeRefOrGetter<boolean>
  onAiNotConfigured?: () => void
  onStatus?: (message: string, warn?: boolean) => void
  onError?: (message: string) => void
  onHtmlUpdated?: (payload: HtmlAiChatHtmlUpdatedPayload) => void
}

export function useHtmlAiChat(options: UseHtmlAiChatOptions) {
  const busy = ref(false)
  const messages = ref<ChatMessage[]>([])
  const sessions = ref(getChatSessionSummaries(toValue(options.articleId)))
  const activeSessionId = ref<string | null>(getActiveChatSessionId(toValue(options.articleId)))
  const activeSession = ref<ChatSession | null>(null)

  function refreshSessions() {
    sessions.value = getChatSessionSummaries(toValue(options.articleId))
  }

  function loadSession(sessionId: string | null) {
    const articleId = toValue(options.articleId)

    if (!sessionId) {
      activeSessionId.value = null
      activeSession.value = null
      messages.value = []
      setActiveChatSessionId(articleId, null)
      return
    }

    const session = getChatSession(articleId, sessionId)
    if (!session) {
      loadSession(null)
      return
    }

    activeSessionId.value = session.id
    activeSession.value = session
    messages.value = session.messages.map((msg) => ({ ...msg }))
    setActiveChatSessionId(articleId, session.id)
  }

  function ensureSession(firstUserMessage: string): ChatSession {
    if (activeSession.value) return activeSession.value

    const session = createChatSession(toValue(options.articleId), firstUserMessage)
    activeSession.value = session
    activeSessionId.value = session.id
    setActiveChatSessionId(session.articleId, session.id)
    refreshSessions()
    return session
  }

  function persistSession() {
    const session = activeSession.value
    if (!session) return

    session.messages = messages.value.map(({ id, role, content, rawResponse }) => ({
      id,
      role,
      content,
      ...(role === 'assistant' && rawResponse ? { rawResponse } : {}),
    }))
    session.updatedAt = Date.now()
    saveChatSession(session)
    refreshSessions()
  }

  function pushMessage(message: ChatMessage) {
    messages.value = [...messages.value, message]
  }

  function selectSession(sessionId: string) {
    if (sessionId === activeSessionId.value) return
    loadSession(sessionId)
  }

  function newSession() {
    if (busy.value) return
    loadSession(null)
  }

  watch(
    () => toValue(options.articleId),
    (id) => {
      refreshSessions()
      loadSession(getActiveChatSessionId(id))
    },
    { immediate: true },
  )

  async function send(userMessage: string) {
    const doc = options.getDocElement()
    const html = options.getHtml()

    if (!doc || !html || busy.value || toValue(options.blocked ?? false)) return
    if (toValue(options.disabled ?? false)) return

    if (!isAiReady()) {
      options.onAiNotConfigured?.()
      return
    }

    pushMessage({ id: nextChatId(), role: 'user', content: userMessage })
    ensureSession(userMessage)
    persistSession()

    const history = buildChatTurnHistory(messages.value.slice(0, -1))

    busy.value = true
    options.onError?.('')
    options.onStatus?.('AI 正在处理你的请求…', false)

    try {
      const report = generateLayoutReport(doc, doc.ownerDocument.documentElement)
      const result = await editHtmlWithChat({
        fileName: options.getFileName(),
        content: html,
        userMessage,
        report,
        history,
      })

      pushMessage({
        id: nextChatId(),
        role: 'assistant',
        content: result.summary || (result.changed ? '修改已完成' : '无需修改'),
        rawResponse: result.rawResponse,
      })
      persistSession()

      if (!result.changed) {
        options.onStatus?.(result.summary || 'AI 认为当前无需调整', report.overflowPageCount > 0)
        return
      }

      options.onHtmlUpdated?.({
        content: result.content,
        summary: result.summary,
        label: formatVersionLabel('AI 修改'),
      })
      options.onStatus?.(`AI 修改完成：${result.summary}`, false)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      options.onError?.(message)
      options.onStatus?.(message, true)
      pushMessage({ id: nextChatId(), role: 'assistant', content: `出错了：${message}` })
      persistSession()
    } finally {
      busy.value = false
    }
  }

  return {
    busy,
    messages,
    sessions,
    activeSessionId,
    send,
    selectSession,
    newSession,
  }
}
