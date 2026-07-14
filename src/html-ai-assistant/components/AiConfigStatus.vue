<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { DEEPSEEK_MODELS, useAiConfigStore } from '@/stores/ai-config'
import DeepSeekConfigDialog from './DeepSeekConfigDialog.vue'

defineProps<{
  compact?: boolean
}>()

const aiConfigStore = useAiConfigStore()
const { config: aiConfig } = storeToRefs(aiConfigStore)

const dialogOpen = ref(false)

const modelLabel = computed(() => {
  return DEEPSEEK_MODELS.find((item) => item.value === aiConfig.value.model)?.label ?? 'DeepSeek'
})

const keyLabel = computed(() => {
  const key = aiConfig.value.apiKey.trim()
  if (!key) return '补充 Key'
  if (key.length <= 8) return 'Key 已配置'
  return `Key ···${key.slice(-4)}`
})

const hasApiKey = computed(() => !!aiConfig.value.apiKey.trim())

function toggleModel() {
  aiConfigStore.toggleModel()
}

function toggleDeepThinking() {
  aiConfigStore.toggleDeepConversation()
}

function openKeyDialog() {
  dialogOpen.value = true
}

function openConfigDialog() {
  dialogOpen.value = true
}

defineExpose({ openConfigDialog })
</script>

<template>
  <div class="ai-config-status" :class="{ compact }">
    <button
      type="button"
      class="ai-config-badge model"
      :title="`当前模型：${modelLabel}，点击切换`"
      @click="toggleModel"
    >
      {{ modelLabel }}
    </button>
    <button
      type="button"
      class="ai-config-badge thinking"
      :class="{ on: aiConfig.deepConversation }"
      :title="aiConfig.deepConversation ? '深度思考已开启，点击关闭' : '深度思考已关闭，点击开启'"
      @click="toggleDeepThinking"
    >
      深度思考 {{ aiConfig.deepConversation ? '开' : '关' }}
    </button>
    <button
      type="button"
      class="ai-config-badge key"
      :class="{ ready: hasApiKey }"
      :title="hasApiKey ? 'API Key 已配置，点击修改' : '尚未配置 API Key，点击补充'"
      @click="openKeyDialog"
    >
      {{ keyLabel }}
    </button>

    <DeepSeekConfigDialog v-model="dialogOpen" />
  </div>
</template>

<style scoped>
.ai-config-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.ai-config-status.compact {
  gap: 4px;
}

.ai-config-badge {
  padding: 3px 10px;
  border: 1px solid #d4d4d8;
  border-radius: 999px;
  background: #fafafa;
  color: #555;
  font: inherit;
  font-size: 11px;
  line-height: 1.4;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
}

.ai-config-badge:hover {
  background: #f0f0f0;
  border-color: #bbb;
}

.ai-config-badge.model {
  border-color: #7dd3fc;
  color: #0369a1;
  background: #f0f9ff;
}

.ai-config-badge.model:hover {
  background: #e0f2fe;
  border-color: #38bdf8;
}

.ai-config-badge.thinking.on {
  border-color: #c4b5fd;
  color: #5b21b6;
  background: #f5f3ff;
}

.ai-config-badge.key.ready {
  border-color: #93c5fd;
  color: #1d4ed8;
  background: #eff6ff;
}

.ai-config-badge.key:not(.ready) {
  border-color: #fdba74;
  color: #c2410c;
  background: #fff7ed;
}
</style>
