export type DeepSeekModel = 'deepseek-v4-flash' | 'deepseek-v4-pro'

export interface AiConfig {
  apiKey: string
  model: DeepSeekModel
  /** 开启 DeepSeek 思考模式（thinking），先推理再回答，质量更高但更慢 */
  deepConversation: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  systemPrompt?: string
  model?: DeepSeekModel
  apiKey?: string
  deepConversation?: boolean
}
