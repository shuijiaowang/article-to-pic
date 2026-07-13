# Visual HTML Editor

可迁移的 HTML 可视化 DOM 编辑器模块（Vue 3）。从 HtmlHub 的 `AiGenerateVisualEditorDomView` 抽离，整夹复制到其他项目后通常仍需少量适配。

## 设计约定

1. **传入 HTML**：通过 `initialHtml` 一次性传入（非 `v-model`，非响应式 props）；换内容请用 `ref.reload(html)`
2. **返回 HTML**：用户点击「保存」时触发 `@save`，参数为序列化后的**完整 HTML 文档**
3. **内部快照**：撤销/重做（Ctrl+Z / Ctrl+Y）在组件内维护，按当前版本独立
4. **内部版本**：组件内维护 v1、v2… 多版本；版本条 `+` 仅组件内保存，「保存/更新」回传父组件
5. **外部持久化**：父组件/后端决定如何写入线上或项目存储
6. **可选草稿持久化**：传入 `persistKey` + `persistence` 适配器，且 `enableVersionBar` 为 `true` 时，组件在版本/编辑变更时 debounce 写入；模块本身不绑定 localStorage 或具体后端

## 快速使用

```vue
<script setup>
import { ref } from 'vue'
import { VisualHtmlEditor } from '@/visual-html-editor'

const html = ref('<!DOCTYPE html><html>...</html>')
const editorRef = ref(null)

async function onSave(nextHtml) {
  await yourApi.save(nextHtml)
  editorRef.value?.resetBaselineAfterCommit(nextHtml)
}

function onCancel() {
  // 路由返回、弹窗确认等
}
</script>

<template>
  <VisualHtmlEditor
    ref="editorRef"
    :initial-html="html"
    title="页面标题"
    @save="onSave"
    @cancel="onCancel"
    @dirty-change="(d) => console.log('dirty', d)"
  />
</template>
```

## 渲染与 iframe

- HTML 经 `buildPreviewHtml` 处理后，用 **blob URL** 赋给 iframe 的 `src`（非 `srcdoc`）
- iframe `sandbox` 为 `allow-same-origin allow-scripts allow-popups allow-forms`，**页面内 `<script>` 会执行**
- 传入 `previewScopeId` 时，会在 HTML 头部注入 localStorage/sessionStorage 隔离 shim，避免多项目预览互相污染
- `documentHtml` 变化时（加载 HTML、切换版本等）会销毁旧 blob、重新加载 iframe

## 预览模式 / 编辑模式

工具栏提供两种模式切换。**两种模式共用同一个 iframe**，切换时**不会重新加载页面**，只切换是否启用编辑交互：

| 模式 | 行为 |
|------|------|
| **预览模式** | `interactionEnabled = false`：链接、按钮、表单等可正常交互；右侧显示预览说明 |
| **编辑模式** | `interactionEnabled = true`：点击用于点选元素；拦截链接跳转与表单提交；右侧显示属性面板 |

左侧页面区域占满「视口高度 − 顶栏 − 工具栏 −（版本条）− 右侧面板」，编辑/预览**同尺寸同 iframe**。

### 多页（A/B 页）工作流

1. 切到 **预览模式**，在 iframe 内通过页面交互导航到 B 页（依赖页面自身 JS）
2. 切回 **编辑模式** → iframe **保持当前 DOM 不变**，可直接点选 B 页元素继续修改
3. 保存时写回完整 HTML

> 说明：模式切换不会调用 `captureLiveDocumentHtml` 或 reload。多页状态依赖**同一会话内 iframe 不刷新**；若之后切换版本或 `reload`，会从对应版本的已保存 HTML 重新加载。

### 保存按钮可用条件

- **预览模式**：始终可保存（提交 iframe 内当前 DOM 序列化结果）
- **编辑模式**：`dirty === true` 时可保存；传入 `allowSaveWithoutDirty` 后未修改也可保存

### 相关 Props

| 名称 | 类型 | 说明 |
|------|------|------|
| `defaultMode` | `'edit' \| 'preview'` | 初始模式，默认 `edit` |
| `previewScopeId` | `string` | 预览 iframe 的 localStorage 隔离 id，默认 `visual-editor` |
| `allowSaveWithoutDirty` | `boolean` | 编辑模式下未修改时是否允许保存，默认 `false` |

### 相关 Events

| 事件 | 参数 | 说明 |
|------|------|------|
| `mode-change` | `'edit' \| 'preview'` | 模式切换时触发 |

其他保存相关行为：

- **版本条 `+`**：将当前选中版本快照固化为新版本（v2、v3…），不影响线上
- **下载 / 保存**：均针对**当前选中的版本**及其最新快照（含未提交到父组件的编辑）

## 版本切换

工具栏下方显示版本条（`v1` `v2` `+`，选中项右侧显示 `×`），点击切换版本时会保留各版本独立的撤销栈。

| 操作 | 作用 |
|------|------|
| **`+`** | 将**当前选中版本**的快照保存为新版本 |
| **上传新版本** | 打开导入面板，从文件或粘贴源代码创建新的本地版本 |
| **保存 / 更新到线上**（`saveLabel`） | `@save` 回传**当前选中版本**的完整 HTML |
| **下载当前版本**（`downloadLabel`） | `@download` 下载**当前选中版本的 HTML |
| **`×`** | 仅**当前选中版本**显示；删除后若删的是当前版本则自动切到相邻版本 |

切换版本会 flush 当前版本状态 → 加载目标版本 HTML → 刷新 iframe。切换后 Ctrl+Z / Ctrl+Y 仅在该版本的历史内生效。

## API

### Props

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `initialHtml` | `string` | `''` | 初始 HTML，挂载时加载（作为版本 v1）；非响应式 |
| `title` | `string` | `''` | 工具栏标题 |
| `saveLabel` | `string` | `'保存'` | 回传父组件的保存按钮文案 |
| `cancelLabel` | `string` | `'← 返回'` | 取消/返回按钮文案 |
| `downloadLabel` | `string` | `''` | 下载按钮文案；留空且开启版本条时为 `下载当前版本` |
| `showDownloadButton` | `boolean` | — | 是否显示下载按钮；默认随 `downloadLabel` / `enableVersionBar` 推断，设为 `false` 可隐藏 |
| `enableVersionBar` | `boolean` | `true` | 是否显示内部版本条；关闭后同时禁用草稿持久化 |
| `defaultMode` | `'edit' \| 'preview'` | `'edit'` | 初始模式 |
| `previewScopeId` | `string` | `'visual-editor'` | 预览 iframe localStorage 隔离 id |
| `allowSaveWithoutDirty` | `boolean` | `false` | 编辑模式下未修改时是否允许保存 |
| `persistKey` | `string` | `''` | 草稿 key；需配合 `persistence` 且 `enableVersionBar` 为 true |
| `persistLabel` | `string` | `''` | 草稿展示名，写入持久化元数据 |
| `persistence` | `object` | `null` | `{ load(key), save(key, state, meta?), remove?(key) }` |

### 草稿持久化适配器

宿主项目实现存储，组件只约定接口：

```js
const persistence = {
  load(key) {
    // return { versions, activeVersionId, nextVersionId } | null
  },
  save(key, state, meta = {}) {
    // meta.label 为展示名
  },
  remove(key) {
    // 外部保存成功后可清除草稿
  },
}
```

挂载时：有草稿则恢复多版本与撤销栈；无草稿则用 `initialHtml` 初始化。  
编辑 / 版本切换时自动 debounce 保存（500ms）；组件卸载时立即 flush。

也可单独使用 `useVisualHtmlPersistence` 组合式函数自定义触发时机。

### Events

| 事件 | 参数 | 说明 |
|------|------|------|
| `save` | `(html, { versionId })` | 回传当前选中版本的完整 HTML |
| `download` | `(html, { versionId })` | 下载当前选中版本的 HTML |
| `cancel` | — | 用户点击返回/取消 |
| `dirty-change` | `dirty: boolean` | 是否有未保存修改 |
| `mode-change` | `'edit' \| 'preview'` | 模式切换 |
| `version-change` | `{ versionId }` | 切换内部版本 |
| `version-create` | `{ versionId, versionCount }` | 新增内部版本 |
| `version-delete` | `{ versionId, versionCount, activeVersionId }` | 删除内部版本 |

### expose（`ref` 调用）

| 方法 / 属性 | 说明 |
|-------------|------|
| `getHtml()` | 获取 iframe 当前 HTML（`captureLiveDocumentHtml`：冻结可见性并清理编辑器产物） |
| `getActiveVersionHtml()` | 获取当前选中版本最新 HTML（先 flush 再读取，含未提交的编辑） |
| `reload(html)` | 重新加载 HTML，重置为单一 v1，并刷新 iframe |
| `reset()` | 恢复到当前版本加载时的 HTML，并刷新 iframe |
| `resetBaselineAfterCommit(html?)` | 外部保存成功后调用，清除 dirty 并重置撤销栈 |
| `switchVersion(versionId)` | 切换到指定内部版本 |
| `saveAsNewVersion()` | 从当前选中版本快照新增内部版本 |
| `removeVersion(versionId)` | 删除指定版本 |
| `clearPersistedDraft()` | 清除当前 `persistKey` 对应草稿 |
| `flushPersistedDraft()` | 立即写入当前版本状态 |
| `getEditChangeLogText()` | 获取相对当前版本锚点的修改记录文本（可复制给 AI） |
| `setMode(mode)` | 切换 `'edit'` / `'preview'` |
| `versions` / `activeVersionId` | 版本列表与当前版本 id |
| `undo()` / `redo()` | 撤销 / 重做（当前版本内） |
| `dirty` / `mode` | 只读 ref |

### 工具栏插槽

默认工具栏已包含通用操作：**编辑/预览切换、保存、下载、复制修改记录、清除选中样式、状态栏**。多数页面只需改 props 文案即可。

#### `#toolbar-extra`（推荐）

在默认工具栏左侧插入业务控件（文件选择、草稿入口等），**无需重写**模式切换、下载等通用按钮。

```vue
<VisualHtmlEditor
  title=""
  save-label="下载 HTML"
  :show-download-button="false"
  @save="handleDownload"
>
  <template #toolbar-extra="{ dirty }">
    <!-- 自定义标题、文件下拉、上传按钮等 -->
  </template>
</VisualHtmlEditor>
```

作用域参数与 `#toolbar` 相同（见下表）。常用：`dirty`、`mode`、`statusText`。

#### `#toolbar`（完全自定义）

传入 `#toolbar` 时**整栏替换**默认布局，需自行渲染通用按钮；适合布局与默认差异很大的场景。

`#toolbar` / `#toolbar-extra` 作用域参数：

| 名称 | 说明 |
|------|------|
| `dirty` | 是否有未保存修改 |
| `statusText` | 状态栏文案 |
| `mode` | 当前模式 `'edit' \| 'preview'` |
| `canSave` | 保存按钮是否应可用 |
| `frameReady` | iframe 是否已加载 |
| `selectedElement` | 当前选中 DOM 元素 |
| `onSave` / `onCancel` / `onClearStyle` | 保存、取消、清除选中样式 |
| `onSetMode` | 切换模式 |
| `onDownload` / `downloadLabel` | 下载 |
| `onCopyChangeLog` / `changeLogCopied` | 复制修改记录 |
| `onSaveNewVersion` / `onRemoveVersion` / `onSwitchVersion` | 版本操作（版本条 UI 仍在组件内） |
| `versions` / `activeVersionId` / `enableVersionBar` | 版本条数据 |

## 目录结构

```
visual-html-editor/
  index.js
  README.md
  demo/
    demoTemplate.html
  components/
    VisualHtmlEditor.vue      # UI 壳：工具栏、iframe、版本条、属性面板
    PropertyPanel.vue
  composables/
    useVisualHtmlEditor.js      # 编排层：串联 frame / overlay / style / history / version
    useVisualHtmlFrame.js       # iframe 绑定、点选、编辑态事件拦截
    useVisualHtmlOverlay.js     # 选中元素拖拽/缩放 overlay
    useVisualHtmlStyleForm.js   # 属性面板 ↔ DOM 同步
    useVisualHtmlHistory.js     # 撤销/重做
    useVisualHtmlVersionManager.js
    useVisualHtmlPersistence.js
  constants/styleKeys.js
  utils/
    htmlDocument.js             # 解析、序列化、清理编辑器注入 DOM
    previewFrame.js             # blob URL、localStorage 隔离 shim
    domSelection.js
    editorDom.js
    editChangeLog.js
```

## 模块导出

`index.js` 除组件外还导出：

- `useVisualHtmlEditor`、`useVisualHtmlPersistence`、`useVisualHtmlVersionManager`
- `parseHtmlForEdit`、`captureLiveDocumentHtml`、`serializeDocumentHtml`、`cleanEditorArtifacts` 等 HTML 工具
- `createPreviewBlobUrl`、`buildPreviewHtml`
- `buildEditChangeLog`、`formatEditChangeLogForAi`
- `STYLE_KEYS`、`HISTORY_LIMIT`

## 迁移到其他项目

1. 复制整个 `visual-html-editor/` 文件夹
2. 确保目标项目为 **Vue 3**
3. 配置 import 路径（如 `@/visual-html-editor`）
4. 按需调整样式变量（组件内使用 `--vhe-*`，并 fallback 到 `--hh-*` 或默认值）
5. 自行实现 `@save` 的持久化逻辑；可选传入 `persistence` 适配器做会话内多版本草稿恢复

**不是完全插拔式**：样式主题、路由离开确认、消息提示（Toast）等需在各项目中自行接入。

## 能力边界

- 编辑 **body** 内元素；`head` 内容随原始 HTML 保留
- iframe 通过 **blob URL** 加载完整 HTML（含 head 样式、script）；编辑与预览共用同一 iframe 实例
- 样式修改写入 **inline style**（`!important`），不修改 `<style>` 或 class 规则
- **dirty** 判断：比较 iframe `body` 的 innerHTML（去除 overlay、选区描边）与当前版本锚点 `baselineBodyHtml`
- 编辑器运行时会向 iframe 注入：选区描边、编辑引导样式、`__vhe_overlay_root__` 拖拽层；序列化输出前会通过 `cleanEditorArtifacts` 移除
- `getHtml()` 额外调用 `freezeLiveDocumentVisibility`，将运行时 `display:none` / `visibility:hidden` 写成 inline，便于捕获当前可见页状态
- 版本 flush / `getActiveVersionHtml` 默认走 `serializeDocumentHtml`（克隆 DOM 后清理，不修改 live DOM）
- 适用于可信 HTML 内容；未做 XSS sanitize

## HtmlHub 中的用法

| 视图 | 作用 |
|------|------|
| `views/AiGenerateVisualEditorDomView.vue` | AI 项目 HTML 编辑，`@save` 调用 `syncAiProjectHtml` |
| `views/ManageVisualEditorView.vue` | 托管 HTML 记录编辑，`@save` 调用 `updateHtmlContent` |
| `views/VisualEditorToolView.vue` | 本地多文件编辑工具，`#toolbar-extra` 扩展文件栏 |

草稿存储由 `utils/visualEditorPersistence.js`（`htmlHubVisualEditorPersistence`）提供，通过 `persistence` prop 注入组件。

## 数据结构

下面按「你能在哪看到、键叫啥、值是啥」说明。

### 1. localStorage（HtmlHub 草稿）

| 键 | 值 |
|----|-----|
| **`htmlhub_vhe_drafts_v1`** | 整个草稿仓库，一个 JSON 对象 |

```json
{
  "version": 1,
  "entries": {
    "tool:demo": { ...一条草稿... },
    "manage:42": { ...一条草稿... },
    "ai:project-abc": { ...一条草稿... }
  }
}
```

`entries` 里 **每条草稿的键** = `persistKey`，格式 **`scope:refId`**：

| scope | refId 示例 | persistKey 示例 | 用在哪 |
|-------|------------|-----------------|--------|
| `tool` | 本地文件 id | `tool:demo` | 可视化编辑工具页 |
| `manage` | 托管记录 id | `manage:42` | 管理页编辑 |
| `ai` | AI 项目 id | `ai:project-abc` | AI 生成编辑 |

### 2. 单条草稿 `entries[persistKey]`

| 键 | 类型 | 含义 |
|----|------|------|
| `scope` | string | 同上，如 `tool` |
| `refId` | string | 业务 id，如 `demo`、`42` |
| `label` | string | 展示名（文件名、页面标题等） |
| `createdAt` | number | 创建时间戳 |
| `updatedAt` | number | 最后自动保存时间戳 |
| **`state`** | object | **编辑器状态**（见下一节） |

### 3. 编辑器状态 `state`（组件 `exportVersionState()` 写出）

| 键 | 类型 | 含义 |
|----|------|------|
| **`versions`** | array | v1、v2… 各版本数据 |
| **`activeVersionId`** | number | 当前选中的版本号，如 `2` |
| **`nextVersionId`** | number | 下次点 `+` 时的新 id，如 `3` |

### 4. 单个版本 `state.versions[i]`

| 键 | 类型 | 含义 |
|----|------|------|
| **`id`** | number | 版本号 `1`、`2`… |
| **`savedHtml`** | string | **完整 HTML 文档**（`<!DOCTYPE>` + `<html>…`），该版本最新内容 |
| **`baselineBodyHtml`** | string | **仅 `<body>` 内的 HTML**；进入该版本时的锚点，用于 dirty / 复制修改记录 |
| **`historyPast`** | array | 撤销栈，元素为 `BodySnapshot` |
| **`historyCurrent`** | object \| null | 当前历史指针，一个 `BodySnapshot` |
| **`historyFuture`** | array | 重做栈，元素为 `BodySnapshot` |
| `createdAt` | number | 该版本创建时间戳 |

### 5. 快照 `BodySnapshot`（`historyPast` / `historyCurrent` / `historyFuture` 里每一项）

| 键 | 类型 | 含义 |
|----|------|------|
| `t` | number | 快照时间戳 |
| `reason` | string | 触发原因：`load`、`style:auto`、`text:apply` 等 |
| **`bodyHtml`** | string | **仅 body 的 innerHTML**（已去掉 overlay、选区描边） |

### 6. 一张总览（谁存啥）

```
localStorage["htmlhub_vhe_drafts_v1"]
└── entries["manage:42"]
    ├── label: "我的页面 · 可视化编辑"
    └── state
        ├── activeVersionId: 2
        ├── nextVersionId: 3
        └── versions[]
            ├── [0] id=1
            │     savedHtml:      "<!DOCTYPE html><html>…完整文档…</html>"
            │     baselineBodyHtml: "<div>…进入 v1 时 body…</div>"
            │     historyPast / historyCurrent / historyFuture
            └── [1] id=2
                  savedHtml:      "<!DOCTYPE html><html>…v2 最新…</html>"
                  baselineBodyHtml: "<div>…从 v1 分叉时 body…</div>"
                  historyPast / …
```

### 7. 各功能读哪个键

| 功能 | 用到的键 |
|------|----------|
| **iframe 显示** | 当前版本的 `savedHtml`（加载进 blob URL） |
| **dirty（有未保存修改）** | `sanitize(当前 body)` ≠ 当前版本 `baselineBodyHtml` |
| **复制修改记录** | 当前 body HTML − 当前版本 `baselineBodyHtml` |
| **Ctrl+Z / Ctrl+Y** | 当前版本的 `historyPast` / `historyCurrent` / `historyFuture` |
| **@save / 下载** | 当前版本的 `savedHtml`（序列化前 `cleanEditorArtifacts`） |

### 8. 生命周期（简）

1. 挂载：有草稿 → 读 `entries[persistKey].state`；无 → `initialHtml` 建 v1  
2. iframe 就绪：把当前 body 写入 `baselineBodyHtml`，并建 `historyCurrent`（`reason: 'load'`）  
3. 编辑：改 DOM → 推快照；debounce 后 flush 更新 `savedHtml`  
4. 版本 `+`：复制当前 `savedHtml` 为新版本，新版本的 `baselineBodyHtml` = 分叉时刻 body  
5. 切换版本：flush 当前 → 加载目标 `savedHtml` → 恢复其 `baselineBodyHtml` 与历史栈  
6. 外部保存成功：`resetBaselineAfterCommit(html)`，锚点与撤销栈重置

> 运行时锚点变量叫 `anchorBodyHtml`，持久化字段仍叫 `baselineBodyHtml`（同名不同层，别混）。