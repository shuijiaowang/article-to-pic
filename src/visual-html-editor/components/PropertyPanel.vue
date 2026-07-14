<template>
  <div class="vhe-panel-body">
    <p v-if="!selectedElement" class="vhe-panel-empty">
      点击左侧页面元素进行编辑。<br /><br />
      可先切到「预览模式」自由操作多页与交互，再回「编辑模式」继续修改。<br /><br />
      当前支持：颜色、背景、字号、字重、字体、行高、字距、文字装饰/变换/空白、圆角、内边距、外边距、宽度%、对齐（静态样式）。
      <br /><br />
      另外：对除 `script/style/noscript` 外的元素，可直接修改其内部内容（标签/文本都可）；`input`/`textarea` 还可编辑 `placeholder`。
    </p>

    <template v-else>
      <div class="vhe-meta">
        <strong>当前元素</strong>
        <code>{{ selectedLabel }}</code>
      </div>

      <div v-if="canEditTextContent" class="vhe-field-row">
        <div class="vhe-field">
          <label>{{ textContentLabel }}</label>
          <textarea
            v-model="textForm.text"
            rows="3"
            :placeholder="canEditPlaceholder ? '修改 input/textarea 的 value' : '在此修改元素内部 HTML，例如：加标签/改文本/保留结构…'"
          />
        </div>
      </div>

      <div v-if="canEditPlaceholder" class="vhe-field-row">
        <div class="vhe-field">
          <label>占位符（placeholder）</label>
          <input v-model="textForm.placeholder" type="text" placeholder="输入框为空时显示的提示文字" />
        </div>
      </div>

      <div class="vhe-group-title">排版</div>
      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>文字颜色</label>
          <input v-model="styleForm.color" type="color" />
        </div>
        <div class="vhe-field">
          <label>背景颜色</label>
          <input v-model="styleForm.backgroundColor" type="color" />
        </div>
      </div>

      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>字号(px)</label>
          <input v-model.number="styleForm.fontSize" type="number" min="10" max="200" />
        </div>
        <div class="vhe-field">
          <label>字重</label>
          <select v-model="styleForm.fontWeight">
            <option value="">默认</option>
            <option value="300">300</option>
            <option value="400">400</option>
            <option value="500">500</option>
            <option value="600">600</option>
            <option value="700">700</option>
          </select>
        </div>
      </div>

      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>字体</label>
          <select v-model="styleForm.fontFamily">
            <option value="">默认</option>
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value='"Microsoft YaHei", "微软雅黑"'>微软雅黑</option>
            <option value='"PingFang SC", "苹方"'>苹方</option>
            <option value='"Source Han Sans CN", "思源黑体"'>思源黑体</option>
            <option value='"Source Han Serif CN", "思源宋体"'>思源宋体</option>
            <option value='SimHei, "黑体"'>黑体</option>
            <option value='SimSun, "宋体"'>宋体</option>
            <option value='KaiTi, "楷体"'>楷体</option>
            <option value='FangSong, "仿宋"'>仿宋</option>
          </select>
        </div>
        <div class="vhe-field">
          <label>行高(px)</label>
          <input v-model="styleForm.lineHeight" type="number" min="0" max="200" placeholder="默认" />
        </div>
      </div>

      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>字体风格</label>
          <select v-model="styleForm.fontStyle">
            <option value="">默认</option>
            <option value="italic">italic</option>
            <option value="oblique">oblique</option>
          </select>
        </div>
        <div class="vhe-field">
          <label>字距(px)</label>
          <input v-model="styleForm.letterSpacing" type="number" min="-10" max="50" placeholder="默认" />
        </div>
      </div>

      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>文字装饰</label>
          <select v-model="styleForm.textDecoration">
            <option value="">默认</option>
            <option value="underline">underline</option>
            <option value="line-through">line-through</option>
            <option value="overline">overline</option>
          </select>
        </div>
        <div class="vhe-field">
          <label>文字变换</label>
          <select v-model="styleForm.textTransform">
            <option value="">默认</option>
            <option value="uppercase">uppercase</option>
            <option value="lowercase">lowercase</option>
            <option value="capitalize">capitalize</option>
          </select>
        </div>
      </div>

      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>空白（white-space）</label>
          <select v-model="styleForm.whiteSpace">
            <option value="">默认</option>
            <option value="normal">normal</option>
            <option value="nowrap">nowrap</option>
            <option value="pre">pre</option>
            <option value="pre-wrap">pre-wrap</option>
            <option value="pre-line">pre-line</option>
          </select>
        </div>
      </div>

      <div class="vhe-group-title">布局</div>
      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>宽度(%)</label>
          <input v-model.number="styleForm.widthPercent" type="number" min="1" max="100" />
        </div>
        <div class="vhe-field">
          <label>高度(px)</label>
          <input v-model="styleForm.height" type="number" min="0" max="2000" placeholder="默认" />
        </div>
      </div>

      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>显示</label>
          <select v-model="styleForm.display">
            <option value="">默认</option>
            <option value="block">block</option>
            <option value="inline">inline</option>
            <option value="inline-block">inline-block</option>
            <option value="flex">flex</option>
            <option value="inline-flex">inline-flex</option>
            <option value="grid">grid</option>
            <option value="none">none</option>
          </select>
        </div>
        <div class="vhe-field">
          <label>定位</label>
          <select v-model="styleForm.position">
            <option value="">默认</option>
            <option value="relative">relative</option>
            <option value="absolute">absolute</option>
            <option value="fixed">fixed</option>
            <option value="sticky">sticky</option>
          </select>
        </div>
      </div>

      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>上(px)</label>
          <input v-model="styleForm.top" type="number" placeholder="auto" />
        </div>
        <div class="vhe-field">
          <label>右(px)</label>
          <input v-model="styleForm.right" type="number" placeholder="auto" />
        </div>
      </div>

      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>下(px)</label>
          <input v-model="styleForm.bottom" type="number" placeholder="auto" />
        </div>
        <div class="vhe-field">
          <label>左(px)</label>
          <input v-model="styleForm.left" type="number" placeholder="auto" />
        </div>
      </div>

      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>层级(z-index)</label>
          <input v-model="styleForm.zIndex" type="number" placeholder="默认" />
        </div>
        <div class="vhe-field">
          <label>不透明度(0-1)</label>
          <input v-model="styleForm.opacity" type="number" min="0" max="1" step="0.1" placeholder="默认" />
        </div>
      </div>

      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>溢出</label>
          <select v-model="styleForm.overflow">
            <option value="">默认</option>
            <option value="visible">visible</option>
            <option value="hidden">hidden</option>
            <option value="auto">auto</option>
            <option value="scroll">scroll</option>
            <option value="clip">clip</option>
          </select>
        </div>
        <div class="vhe-field">
          <label>浮动</label>
          <select v-model="styleForm.float">
            <option value="">默认</option>
            <option value="left">left</option>
            <option value="right">right</option>
            <option value="none">none</option>
          </select>
        </div>
      </div>

      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>圆角(px)</label>
          <input v-model.number="styleForm.borderRadius" type="number" min="0" max="200" />
        </div>
        <div class="vhe-field">
          <label>内边距(px)</label>
          <input v-model.number="styleForm.padding" type="number" min="0" max="200" />
        </div>
      </div>

      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>上边距(px)</label>
          <input v-model.number="styleForm.marginTop" type="number" min="-200" max="400" />
        </div>
        <div class="vhe-field">
          <label>左边距(px)</label>
          <input v-model.number="styleForm.marginLeft" type="number" min="-200" max="400" />
        </div>
      </div>

      <div class="vhe-group-title">边框</div>
      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>边框宽度(px)</label>
          <input v-model.number="styleForm.borderWidth" type="number" min="0" max="100" />
        </div>
        <div class="vhe-field">
          <label>边框样式</label>
          <select v-model="styleForm.borderStyle">
            <option value="">默认</option>
            <option value="solid">实线</option>
            <option value="dotted">点线</option>
            <option value="dashed">虚线</option>
            <option value="double">双线</option>
            <option value="none">无</option>
          </select>
        </div>
      </div>

      <div class="vhe-field-row">
        <div class="vhe-field">
          <label>边框颜色</label>
          <input v-model="styleForm.borderColor" type="color" />
        </div>
        <div class="vhe-field">
          <label>对齐</label>
          <select v-model="styleForm.textAlign">
            <option value="">默认</option>
            <option value="left">左对齐</option>
            <option value="center">居中</option>
            <option value="right">右对齐</option>
          </select>
        </div>
      </div>

      <div class="vhe-btn-row">
        <button type="button" class="vhe-btn" @click="emit('apply')">应用到预览</button>
        <button type="button" class="vhe-btn" @click="emit('reload')">重置表单</button>
      </div>
    </template>
  </div>
</template>

<script setup>
defineProps({
  selectedElement: {
    type: Object,
    default: null,
  },
  selectedLabel: {
    type: String,
    default: '',
  },
  styleForm: {
    type: Object,
    required: true,
  },
  textForm: {
    type: Object,
    required: true,
  },
  canEditTextContent: {
    type: Boolean,
    default: false,
  },
  canEditPlaceholder: {
    type: Boolean,
    default: false,
  },
  textContentLabel: {
    type: String,
    default: '元素内容',
  },
})

const emit = defineEmits(['apply', 'reload'])
</script>

<style scoped>
.vhe-panel-body {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 12px 16px 20px;
}

.vhe-panel-empty {
  color: var(--vhe-text-2);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: break-word;
  word-break: break-word;
}

.vhe-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--vhe-border);
  color: var(--vhe-text-2);
  font-size: 13px;
  white-space: nowrap;
}

.vhe-meta strong {
  flex-shrink: 0;
}

.vhe-meta code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font: 11px/1.4 ui-monospace, Consolas, monospace;
  background: rgb(148 163 184 / 0.10);
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--vhe-text);
}

.vhe-group-title {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--vhe-border);
  font-size: 12px;
  font-weight: 600;
  color: var(--vhe-text);
}

.vhe-field-row {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.vhe-field {
  flex: 1;
}

.vhe-field label {
  display: block;
  font-size: 11px;
  color: var(--vhe-text-2);
  margin-bottom: 4px;
  font-weight: 600;
}

.vhe-field input,
.vhe-field textarea,
.vhe-field select {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--vhe-border-2);
  border-radius: 5px;
  background: color-mix(in srgb, var(--vhe-surface) 92%, #000 0%);
  color: var(--vhe-text);
  font: inherit;
  font-size: 13px;
  box-sizing: border-box;
}

.vhe-field input[type='color'] {
  padding: 4px;
  height: 38px;
  min-width: 100%;
  border-radius: 8px;
  cursor: pointer;
  background: var(--vhe-surface);
}

.vhe-field input[type='color']::-webkit-color-swatch-wrapper {
  padding: 0;
}

.vhe-field input[type='color']::-webkit-color-swatch {
  border: 1px solid rgb(15 23 42 / 0.12);
  border-radius: 6px;
}

.vhe-field input[type='color']::-moz-color-swatch {
  border: 1px solid rgb(15 23 42 / 0.12);
  border-radius: 6px;
}

.vhe-btn-row {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.vhe-btn-row .vhe-btn {
  flex: 1;
  padding: 7px 14px;
  border: 1px solid var(--vhe-border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--vhe-surface) 92%, #000 0%);
  color: var(--vhe-text);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.vhe-btn-row .vhe-btn:hover:not(:disabled) {
  background: rgb(var(--vhe-brand-rgb) / 0.08);
}
</style>
