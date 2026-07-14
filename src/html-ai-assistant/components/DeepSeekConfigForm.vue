<script setup lang="ts">
import { ref } from 'vue'
import { DEEPSEEK_MODELS } from '@/stores/ai-config'
import type { DeepSeekModel } from '@/types/ai'

const apiKey = defineModel<string>('apiKey', { required: true })
const model = defineModel<DeepSeekModel>('model', { required: true })
const deepConversation = defineModel<boolean>('deepConversation', { required: true })

const showKey = ref(false)
</script>

<template>
  <div class="deepseek-config-form">
    <p class="deepseek-config-desc">配置密钥与模型，供 AI 功能调用</p>

    <label class="deepseek-config-field">
      <span class="deepseek-config-label">API 密钥</span>
      <div class="deepseek-config-key-row">
        <input
          v-model="apiKey"
          class="deepseek-config-input"
          :type="showKey ? 'text' : 'password'"
          placeholder="sk-..."
          autocomplete="off"
        />
        <button type="button" class="deepseek-config-btn" @click="showKey = !showKey">
          {{ showKey ? '隐藏' : '显示' }}
        </button>
      </div>
    </label>

    <fieldset class="deepseek-config-field">
      <legend class="deepseek-config-label">模型</legend>
      <div class="deepseek-config-models">
        <label
          v-for="item in DEEPSEEK_MODELS"
          :key="item.value"
          class="deepseek-config-model"
          :class="{ active: model === item.value }"
        >
          <input v-model="model" type="radio" name="deepseek-model" :value="item.value" />
          <span class="deepseek-config-model-name">{{ item.label }}</span>
          <span class="deepseek-config-model-desc">{{ item.desc }}</span>
          <code class="deepseek-config-model-id">{{ item.value }}</code>
        </label>
      </div>
    </fieldset>

    <label class="deepseek-config-checkbox">
      <input v-model="deepConversation" type="checkbox" />
      <span class="deepseek-config-checkbox-body">
        <span class="deepseek-config-checkbox-title">开启深度思考</span>
        <span class="deepseek-config-checkbox-desc">
          启用 DeepSeek 思考模式（thinking），模型会先推理再回答，适合复杂排版分析与多步修改；关闭时响应更快、成本更低。
        </span>
      </span>
    </label>
  </div>
</template>

<style scoped>
.deepseek-config-form {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.deepseek-config-desc {
  margin: 0 0 20px;
  color: #888;
  font-size: 14px;
}

.deepseek-config-field {
  display: block;
  margin-bottom: 20px;
  border: none;
  padding: 0;
}

.deepseek-config-label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}

.deepseek-config-key-row {
  display: flex;
  gap: 8px;
}

.deepseek-config-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #e5e5ea;
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
}

.deepseek-config-input:focus {
  outline: none;
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.12);
}

.deepseek-config-models {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.deepseek-config-model {
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

.deepseek-config-model:hover {
  background: #fafafa;
}

.deepseek-config-model.active {
  border-color: #7c3aed;
  background: #faf5ff;
}

.deepseek-config-model input {
  grid-row: 1 / 3;
  align-self: center;
  accent-color: #7c3aed;
}

.deepseek-config-model-name {
  font-size: 14px;
  font-weight: 500;
}

.deepseek-config-model-desc {
  grid-column: 2;
  font-size: 12px;
  color: #888;
}

.deepseek-config-model-id {
  grid-column: 2;
  font-size: 12px;
  color: #7c3aed;
}

.deepseek-config-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 4px;
  cursor: pointer;
}

.deepseek-config-checkbox input {
  margin-top: 3px;
  accent-color: #7c3aed;
  flex-shrink: 0;
}

.deepseek-config-checkbox-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.deepseek-config-checkbox-title {
  font-size: 14px;
  font-weight: 500;
}

.deepseek-config-checkbox-desc {
  font-size: 12px;
  color: #888;
  line-height: 1.55;
}

.deepseek-config-btn {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  color: #333;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  flex-shrink: 0;
}

.deepseek-config-btn:hover {
  background: #f5f5f5;
}
</style>
