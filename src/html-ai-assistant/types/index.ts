export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** 完整 AI 响应 JSON，不在界面展示 */
  rawResponse?: string
}

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

export interface HtmlAiChatHtmlUpdatedPayload {
  content: string
  summary?: string
  label: string
}
