import type { AiChatOptions, AiProvider } from '@/ai/types'

let callSeq = 0

/** 包装 Provider.chat，统一打印请求与响应日志 */
export function withAiLogging(provider: AiProvider): AiProvider {
  const chat = provider.chat.bind(provider)

  return {
    ...provider,
    async chat(input: string, options?: AiChatOptions): Promise<string> {
      const id = ++callSeq
      const label = `[AI #${id}] ${provider.name}`

      console.group(`${label} → request`)
      console.log('model:', options?.model ?? '(默认)')
      console.log('deepConversation:', options?.deepConversation ?? '(默认)')
      if (options?.systemPrompt?.trim()) {
        console.log('systemPrompt:', options.systemPrompt)
      }
      console.log('userInput:', input)
      console.groupEnd()

      const start = performance.now()
      try {
        const result = await chat(input, options)
        console.group(`${label} ← response (${Math.round(performance.now() - start)}ms)`)
        console.log('content:', result)
        console.groupEnd()
        return result
      } catch (error) {
        console.group(`${label} ✗ error (${Math.round(performance.now() - start)}ms)`)
        console.error(error)
        console.groupEnd()
        throw error
      }
    },
  }
}
