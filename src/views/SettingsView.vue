<script setup lang="ts">
import { usePageSettingsStore } from '@/stores/page-settings'
import { PAGE_HEIGHT_OPTIONS, type PageHeightPreset } from '@/types/page-settings'

const pageSettings = usePageSettingsStore()

function selectHeight(height: PageHeightPreset) {
  pageSettings.setPageHeight(height)
}
</script>

<template>
  <main class="settings">
    <div class="settings-inner">
      <header class="settings-head">
        <h1>设置</h1>
        <p class="settings-lead">
          画布尺寸为全局配置。切换高度后，布局检测、PNG 导出与 AI 生成 HTML 均按当前比例；
          已有 HTML 若 CSS 仍是旧高度，请重新生成或手动调整。
        </p>
      </header>

      <section class="settings-section">
        <h2>画布比例</h2>
        <p class="settings-hint">宽度固定 1080 px，选择单页导出高度。</p>
        <ul class="ratio-list" role="radiogroup" aria-label="画布高度">
          <li v-for="opt in PAGE_HEIGHT_OPTIONS" :key="opt.height">
            <button
              type="button"
              class="ratio-card"
              :class="{ 'ratio-card--active': pageSettings.config.height === opt.height }"
              role="radio"
              :aria-checked="pageSettings.config.height === opt.height"
              @click="selectHeight(opt.height)"
            >
              <span class="ratio-card-label">{{ opt.label }}</span>
              <span class="ratio-card-hint">{{ opt.hint }}</span>
            </button>
          </li>
        </ul>
        <p class="settings-current">
          当前：<strong>{{ pageSettings.canvasLabel }}</strong>
          · 导出 PNG 约
          {{ pageSettings.exportDimensions.width }}×{{ pageSettings.exportDimensions.height }}
          （{{ pageSettings.exportDimensions.scale }}×）
        </p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.settings {
  min-height: 100%;
  padding: 32px 20px 48px;
  background: #f5f5f7;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.settings-inner {
  max-width: 640px;
  margin: 0 auto;
}

.settings-head h1 {
  font-size: 24px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 8px;
}

.settings-lead {
  font-size: 14px;
  line-height: 1.65;
  color: #555;
  margin-bottom: 28px;
}

.settings-section h2 {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 6px;
}

.settings-hint {
  font-size: 13px;
  color: #666;
  margin-bottom: 16px;
}

.ratio-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.ratio-card {
  width: 100%;
  text-align: left;
  padding: 14px 16px;
  border: 1px solid #e5e5ea;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.ratio-card:hover {
  border-color: #c4b5fd;
}

.ratio-card--active {
  border-color: #7c3aed;
  box-shadow: 0 0 0 1px #7c3aed;
}

.ratio-card-label {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 4px;
}

.ratio-card-hint {
  display: block;
  font-size: 13px;
  color: #666;
}

.settings-current {
  font-size: 13px;
  color: #555;
  line-height: 1.5;
}

.settings-current strong {
  color: #1a1a1a;
  font-weight: 600;
}
</style>
