/** AI Provider 统一聊天选项 */
export interface AiChatOptions {
  systemPrompt?: string
  model?: string
  apiKey?: string
  /** 覆盖全局「深度思考」开关；未传则读取 AI 助手配置 */
  deepConversation?: boolean
}

/** AI Provider 接口 — 后续可扩展阿里等 */
export interface AiProvider {
  readonly id: AiProviderId
  readonly name: string
  chat(input: string, options?: AiChatOptions): Promise<string>
  isConfigured(): boolean
}

export type AiProviderId = 'deepseek'

export interface AiInitStatus {
  initialized: boolean
  providerId: AiProviderId
  ready: boolean
  message: string
}
