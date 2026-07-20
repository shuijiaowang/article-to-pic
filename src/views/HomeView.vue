<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { usePageSettingsStore } from '@/stores/page-settings'

const pageSettings = usePageSettingsStore()
const canvasLabel = computed(() => pageSettings.canvasLabel)
</script>

<template>
  <main class="home">
    <div class="home-inner">
      <section class="home-hero">
        <h1>Article to Pic</h1>
        <p class="home-tagline">把文章排版成长图文，一键导出分享图</p>
        <p class="home-intro">
          在文稿管理里编写或粘贴内容，由 AI 生成 {{ canvasLabel }} 分页 HTML 排版；
          在 HTML 工作台里预览分页效果，用 AI 助手对话微调或切换编辑模式点选改样式，最后导出 PNG 长图。
        </p>
        <div class="home-actions">
          <RouterLink class="home-btn home-btn--primary" to="/documents">
            开始创作
          </RouterLink>
        </div>
      </section>

      <section class="home-steps">
        <h2>使用流程</h2>
        <ol class="home-step-list">
          <li>
            <strong>文稿管理</strong>
            <span>新建或编辑文章，支持富文本与配图</span>
          </li>
          <li>
            <strong>生成 HTML</strong>
            <span>AI 按模板自动分页排版（封面 + 正文块）</span>
          </li>
          <li>
            <strong>预览与微调</strong>
            <span>AI 对话修改、布局优化，或切换编辑模式点选元素改样式与文案</span>
          </li>
          <li>
            <strong>导出长图</strong>
            <span>工作台导出 PNG，也可下载 HTML 源码</span>
          </li>
        </ol>
      </section>

      <section class="home-links">
        <RouterLink class="home-link-card" to="/documents">
          <span class="home-link-title">文稿管理</span>
          <span class="home-link-desc">创建、编辑文稿，生成或上传 HTML，进入 HTML 工作台</span>
        </RouterLink>
      </section>
    </div>
  </main>
</template>

<style scoped>
.home {
  min-height: 100%;
  padding: 48px 24px 64px;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #1a1a1a;
  background: linear-gradient(180deg, #fafafa 0%, #fff 240px);
}

.home-inner {
  max-width: 720px;
  margin: 0 auto;
}

.home-hero {
  text-align: center;
  margin-bottom: 48px;
}

.home-hero h1 {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.home-tagline {
  margin-top: 10px;
  font-size: 17px;
  color: #555;
}

.home-intro {
  margin-top: 16px;
  font-size: 14px;
  line-height: 1.7;
  color: #666;
  max-width: 560px;
  margin-left: auto;
  margin-right: auto;
}

.home-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 28px;
  flex-wrap: wrap;
}

.home-btn {
  display: inline-block;
  padding: 10px 22px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  color: #555;
  background: #f5f5f7;
  border: 1px solid #e5e5ea;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.home-btn:hover {
  background: #eee;
  color: #1a1a1a;
}

.home-btn--primary {
  color: #fff;
  background: #7c3aed;
  border-color: #7c3aed;
}

.home-btn--primary:hover {
  background: #6d28d9;
  border-color: #6d28d9;
  color: #fff;
}

.home-steps {
  margin-bottom: 40px;
}

.home-steps h2 {
  font-size: 15px;
  font-weight: 600;
  color: #888;
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.home-step-list {
  list-style: none;
  counter-reset: step;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.home-step-list li {
  counter-increment: step;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px 14px 48px;
  background: #fff;
  border: 1px solid #e5e5ea;
  border-radius: 10px;
  position: relative;
}

.home-step-list li::before {
  content: counter(step);
  position: absolute;
  left: 16px;
  top: 14px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #7c3aed;
  background: #ede9fe;
  border-radius: 50%;
}

.home-step-list strong {
  font-size: 14px;
  font-weight: 600;
}

.home-step-list span {
  font-size: 13px;
  color: #666;
  line-height: 1.5;
}

.home-links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.home-link-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border-radius: 10px;
  border: 1px solid #e5e5ea;
  background: #fff;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.home-link-card:hover {
  border-color: #c4b5fd;
  box-shadow: 0 2px 8px rgba(124, 58, 237, 0.08);
}

.home-link-title {
  font-size: 14px;
  font-weight: 600;
  color: #7c3aed;
}

.home-link-desc {
  font-size: 12px;
  color: #888;
  line-height: 1.5;
}
</style>
