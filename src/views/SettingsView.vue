<script setup lang="ts">
import { ref } from 'vue'
import { DEEPSEEK_MODELS, useAiConfigStore } from '@/stores/ai-config'
import type { DeepSeekModel } from '@/types/ai'

const store = useAiConfigStore()

const draftApiKey = ref(store.config.apiKey)
const draftModel = ref<DeepSeekModel>(store.config.model)
const showKey = ref(false)
const saved = ref(false)

function handleSave() {
  store.updateConfig({
    apiKey: draftApiKey.value,
    model: draftModel.value,
  })
  saved.value = true
  setTimeout(() => {
    saved.value = false
  }, 2000)
}
</script>

<template>
  <div class="settings-page">
    <header class="settings-header">
      <h1>设置</h1>
      <span v-if="saved" class="settings-saved">已保存</span>
    </header>

    <main class="settings-body">
      <section class="settings-card">
        <h2>DeepSeek API</h2>
        <p class="settings-desc">配置密钥与模型，供 AI 功能调用</p>

        <label class="settings-field">
          <span class="settings-label">API 密钥</span>
          <div class="settings-key-row">
            <input
              v-model="draftApiKey"
              class="settings-input"
              :type="showKey ? 'text' : 'password'"
              placeholder="sk-..."
              autocomplete="off"
            />
            <button type="button" class="settings-btn" @click="showKey = !showKey">
              {{ showKey ? '隐藏' : '显示' }}
            </button>
          </div>
        </label>

        <fieldset class="settings-field">
          <legend class="settings-label">模型</legend>
          <div class="settings-models">
            <label
              v-for="item in DEEPSEEK_MODELS"
              :key="item.value"
              class="settings-model"
              :class="{ active: draftModel === item.value }"
            >
              <input v-model="draftModel" type="radio" name="model" :value="item.value" />
              <span class="settings-model-name">{{ item.label }}</span>
              <span class="settings-model-desc">{{ item.desc }}</span>
              <code class="settings-model-id">{{ item.value }}</code>
            </label>
          </div>
        </fieldset>

        <div class="settings-actions">
          <button type="button" class="settings-btn primary" @click="handleSave">保存配置</button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.settings-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: #f5f5f7;
  color: #1a1a1a;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: #fff;
  border-bottom: 1px solid #e5e5ea;
  flex-shrink: 0;
}

.settings-header h1 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.settings-saved {
  font-size: 12px;
  color: #16a34a;
}

.settings-body {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.settings-card {
  max-width: 640px;
  padding: 24px;
  background: #fff;
  border: 1px solid #e5e5ea;
  border-radius: 12px;
}

.settings-card h2 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
}

.settings-desc {
  margin: 0 0 24px;
  color: #888;
  font-size: 14px;
}

.settings-field {
  display: block;
  margin-bottom: 24px;
  border: none;
  padding: 0;
}

.settings-label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}

.settings-key-row {
  display: flex;
  gap: 8px;
}

.settings-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #e5e5ea;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
}

.settings-input:focus {
  outline: none;
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.12);
}

.settings-models {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-model {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  gap: 2px 10px;
  padding: 14px 16px;
  border: 1px solid #e5e5ea;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.settings-model:hover {
  background: #fafafa;
}

.settings-model.active {
  border-color: #7c3aed;
  background: #faf5ff;
}

.settings-model input {
  grid-row: 1 / 3;
  align-self: center;
  accent-color: #7c3aed;
}

.settings-model-name {
  font-size: 14px;
  font-weight: 500;
}

.settings-model-desc {
  grid-column: 2;
  font-size: 12px;
  color: #888;
}

.settings-model-id {
  grid-column: 2;
  font-size: 12px;
  color: #7c3aed;
}

.settings-actions {
  display: flex;
  gap: 8px;
}

.settings-btn {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  color: #333;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.settings-btn:hover {
  background: #f5f5f5;
}

.settings-btn.primary {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #fff;
}

.settings-btn.primary:hover {
  background: #6d28d9;
}
</style>
