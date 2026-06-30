export interface StoredChatMessage {
  id: string
  role: 'user' | 'assistant'
  /** 界面展示用文本（用户提问 / AI summary） */
  content: string
  /** AI 完整响应 JSON，仅 assistant 消息存储 */
  rawResponse?: string
}

export interface ChatTurnHistory {
  userMessage: string
  assistantRawResponse: string
}

export interface ChatSession {
  id: string
  articleId: string
  title: string
  createdAt: number
  updatedAt: number
  messages: StoredChatMessage[]
}

export type ChatSessionSummary = Pick<ChatSession, 'id' | 'title' | 'createdAt' | 'updatedAt'>

const STORAGE_KEY = 'article-to-pic:chat-history'
const ACTIVE_SESSION_PREFIX = 'article-to-pic:active-chat-session:'

function loadAll(): Record<string, ChatSession[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, ChatSession[]>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveAll(data: Record<string, ChatSession[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function createSessionId() {
  return crypto.randomUUID()
}

export function deriveSessionTitle(firstUserMessage: string): string {
  const text = firstUserMessage.trim().replace(/\s+/g, ' ')
  if (!text) return '新对话'
  return text.length > 36 ? `${text.slice(0, 36)}…` : text
}

export function getChatSessions(articleId: string): ChatSession[] {
  const sessions = loadAll()[articleId] ?? []
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getChatSessionSummaries(articleId: string): ChatSessionSummary[] {
  return getChatSessions(articleId).map(({ id, title, createdAt, updatedAt }) => ({
    id,
    title,
    createdAt,
    updatedAt,
  }))
}

export function getChatSession(articleId: string, sessionId: string): ChatSession | null {
  return getChatSessions(articleId).find((s) => s.id === sessionId) ?? null
}

export function saveChatSession(session: ChatSession) {
  const all = loadAll()
  const list = all[session.articleId] ?? []
  const index = list.findIndex((s) => s.id === session.id)
  if (index >= 0) {
    list[index] = session
  } else {
    list.push(session)
  }
  all[session.articleId] = list
  saveAll(all)
}

export function deleteChatSession(articleId: string, sessionId: string) {
  const all = loadAll()
  const list = all[articleId]
  if (!list) return
  all[articleId] = list.filter((s) => s.id !== sessionId)
  if (all[articleId].length === 0) delete all[articleId]
  saveAll(all)
  if (getActiveChatSessionId(articleId) === sessionId) {
    setActiveChatSessionId(articleId, null)
  }
}

export function getActiveChatSessionId(articleId: string): string | null {
  try {
    return localStorage.getItem(`${ACTIVE_SESSION_PREFIX}${articleId}`)
  } catch {
    return null
  }
}

export function setActiveChatSessionId(articleId: string, sessionId: string | null) {
  const key = `${ACTIVE_SESSION_PREFIX}${articleId}`
  if (sessionId) {
    localStorage.setItem(key, sessionId)
  } else {
    localStorage.removeItem(key)
  }
}

export function createChatSession(articleId: string, firstUserMessage: string): ChatSession {
  const now = Date.now()
  return {
    id: createSessionId(),
    articleId,
    title: deriveSessionTitle(firstUserMessage),
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

/** 从已存储的消息列表提取多轮对话历史（不含当前待发送的用户消息） */
export function buildChatTurnHistory(messages: StoredChatMessage[]): ChatTurnHistory[] {
  const turns: ChatTurnHistory[] = []

  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i]
    if (!msg || msg.role !== 'user') continue

    const reply = messages[i + 1]
    if (reply?.role !== 'assistant') continue

    turns.push({
      userMessage: msg.content,
      assistantRawResponse: reply.rawResponse ?? reply.content,
    })
    i += 1
  }

  return turns
}
