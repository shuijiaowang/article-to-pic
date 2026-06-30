import type { AiInitStatus, AiProvider, AiProviderId } from '@/ai/types'
import { deepseekProvider } from '@/ai/providers/deepseek'
import { withAiLogging } from '@/ai/with-logging'

const providers: Record<AiProviderId, AiProvider> = {
  deepseek: withAiLogging(deepseekProvider),
}

let initialized = false
let activeProviderId: AiProviderId = 'deepseek'

/** 初始化 AI 子系统（应用启动时调用一次） */
export function initAi(providerId: AiProviderId = 'deepseek'): AiInitStatus {
  activeProviderId = providerId in providers ? providerId : 'deepseek'
  initialized = true
  return getAiStatus()
}

/** 获取当前 AI 初始化状态 */
export function getAiStatus(): AiInitStatus {
  const provider = getAiProvider()
  const ready = provider.isConfigured()

  return {
    initialized,
    providerId: activeProviderId,
    ready,
    message: ready
      ? `${provider.name} 已就绪`
      : `请先在设置页配置 ${provider.name} API 密钥`,
  }
}

/** 获取当前激活的 AI Provider */
export function getAiProvider(): AiProvider {
  if (!initialized) {
    initAi()
  }
  return providers[activeProviderId]
}

/** AI 是否已配置可用 */
export function isAiReady(): boolean {
  return getAiProvider().isConfigured()
}
