export { default as AiChatPanel } from './components/AiChatPanel.vue'
export { default as AiConfigStatus } from './components/AiConfigStatus.vue'
export { default as DeepSeekConfigDialog } from './components/DeepSeekConfigDialog.vue'
export { default as DeepSeekConfigForm } from './components/DeepSeekConfigForm.vue'
export { default as HtmlAiAssistant } from './components/HtmlAiAssistant.vue'

export { useHtmlAiChat } from './composables/useHtmlAiChat'
export type { UseHtmlAiChatOptions } from './composables/useHtmlAiChat'

export { useHtmlAiLayoutFix } from './composables/useHtmlAiLayoutFix'
export type { UseHtmlAiLayoutFixOptions } from './composables/useHtmlAiLayoutFix'

export {
  buildChatTurnHistory,
  createChatSession,
  deleteChatSession,
  deriveSessionTitle,
  getActiveChatSessionId,
  getChatSession,
  getChatSessionSummaries,
  getChatSessions,
  saveChatSession,
  setActiveChatSessionId,
} from './storage/chat-history'

export type {
  ChatMessage,
  ChatSession,
  ChatSessionSummary,
  ChatTurnHistory,
  HtmlAiChatHtmlUpdatedPayload,
  StoredChatMessage,
} from './types'
