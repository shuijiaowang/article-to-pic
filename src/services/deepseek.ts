import { useAiConfigStore } from '@/stores/ai-config'
import type { ChatMessage, ChatOptions } from '@/types/ai'

const API_BASE = 'https://api.deepseek.com'

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

function resolveConfig(options?: ChatOptions) {
  const store = useAiConfigStore()
  const apiKey = options?.apiKey ?? store.config.apiKey
  const model = options?.model ?? store.config.model

  if (!apiKey) {
    throw new Error('请先在设置页配置 DeepSeek API 密钥')
  }

  return { apiKey, model }
}

function buildMessages(input: string, systemPrompt?: string): ChatMessage[] {
  const messages: ChatMessage[] = []
  if (systemPrompt?.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() })
  }
  messages.push({ role: 'user', content: input })
  return messages
}

/**
 * 调用 DeepSeek Chat Completions API，输入文本，返回模型回复文本。
 */
export async function chat(input: string, options?: ChatOptions): Promise<string> {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('输入内容不能为空')
  }

  const { apiKey, model } = resolveConfig(options)

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(trimmed, options?.systemPrompt),
      stream: false,
    }),
  })

  const data = (await response.json()) as ChatCompletionResponse

  if (!response.ok) {
    throw new Error(data.error?.message ?? `请求失败 (${response.status})`)
  }

  const content = data.choices?.[0]?.message?.content
  if (content == null) {
    throw new Error('模型未返回有效内容')
  }

  return content
}
