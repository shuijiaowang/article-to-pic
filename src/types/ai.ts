export type DeepSeekModel = 'deepseek-v4-flash' | 'deepseek-v4-pro'

export interface AiConfig {
  apiKey: string
  model: DeepSeekModel
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  systemPrompt?: string
  model?: DeepSeekModel
  apiKey?: string
}
