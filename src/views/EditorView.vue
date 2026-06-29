<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { initEditor } from '@/editor/editor'

let destroyEditor: (() => void) | undefined

onMounted(() => {
  destroyEditor = initEditor()
})

onUnmounted(() => {
  destroyEditor?.()
})
</script>

<template>
  <div class="editor-page">
    <header class="ed-toolbar">
      <h1>TextToPic 编辑器</h1>
      <button type="button" id="btn-open">打开 HTML</button>
      <label class="btn" for="file-input">上传 HTML</label>
      <button type="button" id="btn-save" class="primary" disabled>保存到源文件</button>
      <button type="button" id="btn-download" disabled>另存为…</button>
      <span class="ed-status" id="status">请打开 / 拖拽 template.html（Chrome / Edge 可写回）</span>
    </header>

    <main class="ed-main">
      <div class="ed-canvas-wrap" id="canvas-wrap">
        <div class="ed-empty" id="empty-state">
          <p>打开、上传或拖拽 TextToPic 模板 HTML</p>
          <p class="ed-drop-hint">将 .html 文件拖到此处</p>
          <label class="btn" for="file-input">选择 template.html</label>
        </div>
        <div id="doc" hidden></div>
        <div id="ed-overlay">
          <div class="ed-sel-box" id="sel-box">
            <span class="ed-sel-label" id="sel-label"></span>
            <div
              class="ed-handle ed-handle-n"
              data-handle="margin-top"
              title="拖动调整 margin-top"
            ></div>
            <div
              class="ed-handle ed-handle-s"
              data-handle="margin-bottom"
              title="拖动调整 margin-bottom"
            ></div>
            <div
              class="ed-handle ed-handle-se"
              data-handle="font-size"
              title="拖动调整 font-size"
            ></div>
            <div
              class="ed-handle ed-handle-sw"
              data-handle="padding"
              title="拖动调整 padding"
            ></div>
          </div>
        </div>
      </div>

      <aside class="ed-panel">
        <div class="ed-panel-head">属性</div>
        <div class="ed-panel-body" id="panel-body">
          <p class="ed-panel-empty">
            点击页面 (.page) 或内容块 (.block) 进行编辑。<br /><br />
            拖动句柄可调整间距与字号；右侧面板可改颜色、对齐等。<br /><br />
            <strong>写回源文件</strong>：用「打开 HTML」或从资源管理器拖入文件，获取句柄后 Ctrl+S
            直接覆盖保存；「另存为」仅用于导出副本。
          </p>
        </div>
      </aside>
    </main>

    <input type="file" id="file-input" accept=".html,text/html" hidden />
  </div>
</template>

<style scoped>
.editor-page {
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: #111;
  color: #eee;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

* {
  box-sizing: border-box;
}

.ed-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #1a1a1a;
  border-bottom: 1px solid #333;
  flex-shrink: 0;
}

.ed-toolbar h1 {
  font-size: 15px;
  font-weight: 600;
  margin: 0 8px 0 0;
}

.ed-toolbar button,
.ed-toolbar label.btn {
  padding: 7px 14px;
  border: 1px solid #444;
  border-radius: 6px;
  background: #2a2a2a;
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.ed-toolbar button:hover,
.ed-toolbar label.btn:hover {
  background: #3a3a3a;
}

.ed-toolbar button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ed-toolbar button.primary {
  background: #7c3aed;
  border-color: #7c3aed;
}

.ed-toolbar button.primary:hover {
  background: #6d28d9;
}

.ed-status {
  margin-left: auto;
  font-size: 12px;
  color: #888;
}

.ed-status.dirty {
  color: #fbbf24;
}

.ed-main {
  flex: 1;
  display: flex;
  min-height: 0;
}

.ed-canvas-wrap {
  flex: 1;
  position: relative;
  overflow: auto;
  background: #2a2a2a;
  padding: 20px;
}

.ed-canvas-wrap :deep(#doc) {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 24px;
  width: max-content;
  min-width: 100%;
  justify-content: center;
  position: relative;
}

.ed-canvas-wrap :deep(.page-wrap) {
  flex-shrink: 0;
  width: 1080px;
  transform: scale(var(--preview-scale, 0.42));
  transform-origin: top left;
  margin-bottom: calc(1080px * (var(--preview-scale, 0.42) - 1) * -1 + 200px);
  margin-right: calc(1080px * (var(--preview-scale, 0.42) - 1));
}

.ed-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  gap: 16px;
}

.ed-empty p {
  margin: 0;
  font-size: 14px;
}

.ed-empty .ed-drop-hint {
  font-size: 12px;
  color: #555;
  margin-top: 4px;
}

.ed-canvas-wrap.ed-drag-over::after {
  content: '松开以加载 HTML';
  position: absolute;
  inset: 0;
  background: rgba(124, 58, 237, 0.12);
  border: 2px dashed #7c3aed;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  color: #c4b5fd;
  z-index: 2000;
  pointer-events: none;
}

:global(body.ed-drag-over) .ed-main::after {
  content: '';
  position: fixed;
  inset: 0;
  top: 96px;
  background: rgba(124, 58, 237, 0.06);
  border: 2px dashed rgba(124, 58, 237, 0.5);
  z-index: 500;
  pointer-events: none;
}

#ed-overlay {
  position: absolute;
  pointer-events: none;
  z-index: 1000;
  display: none;
}

#ed-overlay.visible {
  display: block;
}

.ed-sel-box {
  position: absolute;
  border: 2px solid #7c3aed;
  box-shadow: 0 0 0 1px rgba(124, 58, 237, 0.3);
  pointer-events: none;
}

.ed-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #fff;
  border: 2px solid #7c3aed;
  border-radius: 2px;
  pointer-events: auto;
  cursor: pointer;
  z-index: 2;
}

.ed-handle-n {
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  cursor: ns-resize;
}

.ed-handle-s {
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  cursor: ns-resize;
}

.ed-handle-se {
  bottom: -6px;
  right: -6px;
  cursor: nwse-resize;
}

.ed-handle-sw {
  bottom: -6px;
  left: -6px;
  cursor: nesw-resize;
}

.ed-sel-label {
  position: absolute;
  top: -26px;
  left: 0;
  background: #7c3aed;
  color: #fff;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
}

.ed-canvas-wrap :deep(.page.ed-hover),
.ed-canvas-wrap :deep(.block.ed-hover) {
  outline: 1px dashed rgba(124, 58, 237, 0.5);
  outline-offset: 2px;
}

.ed-canvas-wrap :deep(.page.ed-selected),
.ed-canvas-wrap :deep(.block.ed-selected) {
  outline: 2px solid #7c3aed;
  outline-offset: 2px;
}

.ed-panel {
  width: 300px;
  flex-shrink: 0;
  background: #1a1a1a;
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ed-panel-head {
  padding: 14px 16px;
  border-bottom: 1px solid #333;
  font-size: 13px;
  font-weight: 600;
}

.ed-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 20px;
}

.ed-panel-body :deep(.ed-panel-empty) {
  color: #666;
  font-size: 13px;
  line-height: 1.6;
}

.ed-panel-body :deep(.ed-field) {
  margin-bottom: 12px;
}

.ed-panel-body :deep(.ed-field label) {
  display: block;
  font-size: 11px;
  color: #888;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ed-panel-body :deep(.ed-field input[type='text']),
.ed-panel-body :deep(.ed-field input[type='number']),
.ed-panel-body :deep(.ed-field select),
.ed-panel-body :deep(.ed-field textarea) {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid #444;
  border-radius: 5px;
  background: #111;
  color: #eee;
  font: inherit;
  font-size: 13px;
}

.ed-panel-body :deep(.ed-field textarea) {
  min-height: 72px;
  resize: vertical;
  line-height: 1.45;
}

.ed-panel-body :deep(.ed-field input[type='color']) {
  width: 100%;
  height: 34px;
  padding: 2px;
  border: 1px solid #444;
  border-radius: 5px;
  background: #111;
  cursor: pointer;
}

.ed-panel-body :deep(.ed-field-row) {
  display: flex;
  gap: 8px;
}

.ed-panel-body :deep(.ed-field-row .ed-field) {
  flex: 1;
}

.ed-panel-body :deep(.ed-meta) {
  font-size: 12px;
  color: #666;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #333;
  line-height: 1.5;
}

.ed-panel-body :deep(.ed-meta strong) {
  color: #aaa;
}

.ed-panel-body :deep(.ed-section-title) {
  font-size: 11px;
  color: #7c3aed;
  font-weight: 600;
  margin: 16px 0 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ed-panel-body :deep(.ed-section-title:first-child) {
  margin-top: 0;
}

.ed-panel-body :deep(.ed-btn-row) {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.ed-panel-body :deep(.ed-btn-row button) {
  flex: 1;
  padding: 7px;
  border: 1px solid #444;
  border-radius: 5px;
  background: #2a2a2a;
  color: #ccc;
  cursor: pointer;
  font-size: 12px;
}

.ed-panel-body :deep(.ed-btn-row button:hover) {
  background: #333;
  color: #fff;
}
</style>
