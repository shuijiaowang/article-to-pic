import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AiConfig, DeepSeekModel } from '@/types/ai'

const STORAGE_KEY = 'article-to-pic:ai-config'

const DEFAULT_CONFIG: AiConfig = {
  apiKey: '',
  model: 'deepseek-v4-flash',
  deepConversation: false,
}

export const DEEPSEEK_MODELS: { value: DeepSeekModel; label: string; desc: string }[] = [
  { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', desc: '速度快、成本低，适合日常任务' },
  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', desc: '能力更强，适合复杂任务' },
]

function loadFromStorage(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    const parsed = JSON.parse(raw) as Partial<AiConfig>
    return {
      apiKey: parsed.apiKey ?? DEFAULT_CONFIG.apiKey,
      model: parsed.model === 'deepseek-v4-pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash',
      deepConversation: parsed.deepConversation === true,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

function saveToStorage(config: AiConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export const useAiConfigStore = defineStore('ai-config', () => {
  const config = ref<AiConfig>(loadFromStorage())

  function persist() {
    saveToStorage(config.value)
  }

  function setApiKey(apiKey: string) {
    config.value.apiKey = apiKey.trim()
    persist()
  }

  function setModel(model: DeepSeekModel) {
    config.value.model = model
    persist()
  }

  function updateConfig(partial: Partial<AiConfig>) {
    if (partial.apiKey !== undefined) {
      config.value.apiKey = partial.apiKey.trim()
    }
    if (partial.model !== undefined) {
      config.value.model = partial.model
    }
    if (partial.deepConversation !== undefined) {
      config.value.deepConversation = partial.deepConversation
    }
    persist()
  }

  return {
    config,
    setApiKey,
    setModel,
    updateConfig,
  }
})
