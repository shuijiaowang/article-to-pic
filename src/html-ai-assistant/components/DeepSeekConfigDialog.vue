<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAiConfigStore } from '@/stores/ai-config'
import type { DeepSeekModel } from '@/types/ai'
import DeepSeekConfigForm from './DeepSeekConfigForm.vue'

const visible = defineModel<boolean>({ default: false })

const store = useAiConfigStore()

const draftApiKey = ref('')
const draftModel = ref<DeepSeekModel>('deepseek-v4-flash')
const draftDeepConversation = ref(false)
const saved = ref(false)

function syncDraftFromStore() {
  draftApiKey.value = store.config.apiKey
  draftModel.value = store.config.model
  draftDeepConversation.value = store.config.deepConversation
}

watch(
  visible,
  (open) => {
    if (open) syncDraftFromStore()
  },
  { immediate: true },
)

function close() {
  visible.value = false
}

function handleSave() {
  store.updateConfig({
    apiKey: draftApiKey.value,
    model: draftModel.value,
    deepConversation: draftDeepConversation.value,
  })
  saved.value = true
  setTimeout(() => {
    saved.value = false
    close()
  }, 400)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="deepseek-dialog-backdrop" @click.self="close">
      <div class="deepseek-dialog" role="dialog" aria-labelledby="deepseek-dialog-title" aria-modal="true">
        <header class="deepseek-dialog-head">
          <h2 id="deepseek-dialog-title" class="deepseek-dialog-title">DeepSeek 配置</h2>
          <span v-if="saved" class="deepseek-dialog-saved">已保存</span>
          <button type="button" class="deepseek-dialog-close" aria-label="关闭" @click="close">×</button>
        </header>

        <div class="deepseek-dialog-body">
          <DeepSeekConfigForm
            v-model:api-key="draftApiKey"
            v-model:model="draftModel"
            v-model:deep-conversation="draftDeepConversation"
          />
        </div>

        <footer class="deepseek-dialog-foot">
          <button type="button" class="deepseek-dialog-btn" @click="close">取消</button>
          <button type="button" class="deepseek-dialog-btn primary" @click="handleSave">保存</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.deepseek-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
}

.deepseek-dialog {
  width: min(640px, 100%);
  max-height: min(90vh, 720px);
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.deepseek-dialog-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 20px;
  border-bottom: 1px solid #e5e5ea;
  flex-shrink: 0;
}

.deepseek-dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.deepseek-dialog-saved {
  font-size: 12px;
  color: #16a34a;
}

.deepseek-dialog-close {
  margin-left: auto;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #666;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.deepseek-dialog-close:hover {
  background: #f4f4f5;
}

.deepseek-dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.deepseek-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid #e5e5ea;
  flex-shrink: 0;
}

.deepseek-dialog-btn {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  color: #333;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.deepseek-dialog-btn:hover {
  background: #f5f5f5;
}

.deepseek-dialog-btn.primary {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}

.deepseek-dialog-btn.primary:hover {
  background: #6d28d9;
}
</style>
