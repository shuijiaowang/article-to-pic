# 工作包设计（文件夹 + 句柄同步）

> 状态：设计稿，可全量重构，**不兼容旧数据**（清空 localStorage / IndexedDB 即可）。
> 范围：一篇长图文 = 一个本地文件夹；网站通过 Directory Handle 绑定后双向同步。
> 不做 zip。

---

## 1. 目标

| 目标 | 做法 |
|------|------|
| 本地 Cursor/Codex 能看图排版 | `文稿.md` 用 `./assets/xxx` 相对路径 |
| 网站预览 / 导出 PNG | HTML 用 `data-asset-id` + `asset://id`；二进制在 IndexedDB |
| 上传 / 下载不丢图 | 导入导出整文件夹（`assets/` + `manifest.json`） |
| 本地改完 → 网站更新 | 句柄扫描差异，拉入网站 |
| 网站改完 → 写回本地 | 句柄写回文件夹 |

**核心原则**：不是一种路径走天下，而是 **manifest 做翻译**。

---

## 2. 磁盘上的工作包

### 2.1 目录约定（唯一真相源的文件面）

```
{任意文件夹名}/
├── manifest.json          # 必选：身份与映射
├── 文稿.md                # 必选：三区 Markdown（相对路径插图）
├── article.html           # 可选：当前活动 HTML 长图
├── assets/                # 可选：图片文件
│   ├── cover.webp
│   └── step-01.png
└── SKILL.md               # 可选：Cursor skill（不参与同步逻辑）
```

**不放进工作包**：AI 对话历史、AI API Key、浏览器内 undo 栈。

### 2.2 `manifest.json` 规范

```json
{
  "schemaVersion": 1,
  "packageId": "550e8400-e29b-41d4-a716-446655440000",
  "title": "如何把本地网页转为在线链接",
  "updatedAt": "2026-07-16T03:00:00.000Z",
  "activeHtmlFile": "article.html",
  "assets": {
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890": {
      "path": "cover.webp",
      "mime": "image/webp",
      "width": 1080,
      "height": 720,
      "sha256": "optional-hex",
      "bytes": 102400
    },
    "b2c3d4e5-f6a7-8901-bcde-f12345678901": {
      "path": "step-01.png",
      "mime": "image/png",
      "width": 800,
      "height": 1200,
      "sha256": null,
      "bytes": 204800
    }
  }
}
```

| 字段 | 说明 |
|------|------|
| `schemaVersion` | 固定 `1`；以后破坏性变更再升 |
| `packageId` | 稳定 UUID；**等于**网站内 `Article.id`。首次创建由网站生成并写回 |
| `title` | 展示用；可与 `#` 标题同步 |
| `updatedAt` | ISO 时间；任一侧保存后更新 |
| `activeHtmlFile` | 相对包根路径；默认 `article.html`。多版本后续可扩展为 `versions/*.html` |
| `assets[id].path` | 相对 `assets/` 的文件名（禁止 `../`） |

**assetId 规则**：永远是 UUID。文件名可变，id 不变；改名只改 `path`。

### 2.3 `文稿.md` 插图约定

```markdown
![封面示意](./assets/cover.webp "width=1080 height=720")
```

- 只允许 `./assets/{filename}`（或 `assets/{filename}`）
- title 里可带 `width=` / `height=`（与现有 `article-md` 风格一致）
- **禁止** `asset://`、本地绝对路径、`http(s):`、base64

解析时：`path → manifest.assets 反查 id → asset://id`。

### 2.4 `article.html` 插图约定

与现有 Skill 一致：

- `<img data-asset-id="..." data-width="..." data-height="..." alt="...">`
- **不写 `src` / base64**（持久化形态）
- 网站运行时再 resolve 成 blob URL

导出到磁盘时保持该约定；本地用浏览器直接打开 HTML **不会**显示图——本地看图靠 Cursor 读 `文稿.md` + `assets/`，或网站预览。

### 2.5 网站内运行时 vs 磁盘

| 层 | 文稿插图 | HTML 插图 | 二进制 |
|----|----------|-----------|--------|
| 磁盘工作包 | `./assets/xxx` | `data-asset-id` only | `assets/*` 文件 |
| 网站内存 / 持久化 | TipTap HTML 里 `asset://id` | `asset://` + `data-asset-id` | IndexedDB blob |

---

## 3. 浏览器内数据模型（重构后）

不再用 localStorage 存整篇文稿列表为主存；改为 **IndexedDB 统一库**。

### 3.1 DB：`article-to-pic`（单库多 store）

```
articles
  key: id (= packageId)
  value: {
    id, title, cover, body, notes,   // cover/body/notes = TipTap HTML（asset://）
    createdAt, updatedAt,
    htmlVersions: [{ id, html, createdAt, label?, summary? }],
    activeHtmlVersionId?,
    // 绑定信息（无句柄时为空）
    binding?: {
      hasHandle: true,
      folderName: string,
      lastSyncedAt: number,
      lastLocalScanAt?: number,
      permission: 'granted' | 'prompt' | 'denied' | 'unknown'
    }
  }

assets
  key: id
  value: { id, articleId, blob, mime, size, width, height, createdAt, path? }
  // path = manifest 中的相对文件名，便于导出

handles
  key: articleId
  value: {
    articleId,
    directoryHandle: FileSystemDirectoryHandle,  // 可结构化克隆进 IDB
    boundAt: number
  }

meta
  key: 'app'
  value: { activeArticleId?, schemaVersion: 1 }
```

**丢弃**：旧的 `article-to-pic:articles` localStorage、独立的 `article-to-pic-assets` 库名可合并进本库（新名即可）。

### 3.2 无句柄时

仍可在网站内编辑（纯浏览器），但：

- 「从本地更新 / 保存到本地」禁用或引导「绑定文件夹」
- 仍可「另存为文件夹」：`showDirectoryPicker` 选空目录后写出整包并绑定

---

## 4. 映射与转换

### 4.1 模块边界（建议路径）

```
src/work-package/
  types.ts              # Manifest, WorkPackageFileSet
  manifest.ts           # parse / stringify / validate
  paths.ts              # 校验 assets 相对路径、禁止穿越
  md-bridge.ts          # MD ↔ Article（相对路径 ↔ asset://）
  html-bridge.ts        # HTML 内 asset 引用校验 / 收集
  import-folder.ts      # 读 DirectoryHandle → Article + blobs
  export-folder.ts      # Article + blobs → 写 DirectoryHandle
  sync.ts               # 更新 / 保存 / 差异检测
  permission.ts         # query / request read|readwrite
  handles.ts            # IDB 存取 handle
```

### 4.2 MD 双向

**导入（磁盘 → 网站）**

1. 读 `文稿.md`
2. 正则/解析 `![](./assets/xxx)` → 查 manifest（或扫 `assets/` 补 id）→ 换成 `asset://id` + data-width/height
3. `markdownToArticle` → `cover/body/notes`

**导出（网站 → 磁盘）**

1. `articleToMarkdown` 前：把 `asset://id` 换成 `./assets/{path}`（查 manifest / assets.path）
2. 写 `文稿.md`

### 4.3 图片入库

**从文件夹导入一张图**

```
file in assets/cover.webp
  → 若 manifest 有 path 对应 id：用该 id
  → 否则 crypto.randomUUID()，写入 manifest.assets
  → saveArticleAsset({ id, blob, path: "cover.webp", ... })
```

**网站编辑器上传一张图**（已绑定文件夹时双写）

```
File → UUID → IndexedDB
  → 选文件名：sanitize(原名) 或 `{shortId}.ext`，保证 assets/ 内唯一
  → directoryHandle.getDirectoryHandle("assets", { create:true })
  → 写文件
  → 更新内存 manifest + 写回 manifest.json
  → TipTap 插入 asset://
  → （可选）同步改 draft 的 MD 形态仅在「保存到本地」时统一写出
```

未绑定句柄：只写 IndexedDB（与现在类似）。

### 4.4 HTML 版本 vs 磁盘单文件

| 网站 | 磁盘（v1） |
|------|------------|
| 多个 `htmlVersions` | 只落盘 **当前活动版本** → `article.html` |
| 「从本地更新」读到 `article.html` | 作为 **新版本** 追加（label：`本地更新`），并设为 active |

v1 **不**把历史版本全部写到磁盘，避免复杂。若用户需要历史，在网站内保留；导出包只带当前稿。

---

## 5. 用户流程

### 5.1 打开 / 绑定工作包

```
文稿管理 →「打开工作包」
  → showDirectoryPicker()
  → requestPermission({ mode: 'readwrite' })  // 一次要读写，减少二次弹窗
  → 读 manifest.json
      有 → packageId 作为 articleId；加载/覆盖该文稿
      无 → 生成 packageId，写 manifest；从 文稿.md / assets 推断
  → 导入 文稿.md、assets/*、article.html（若有）
  → handles.put(directoryHandle)
  → 进入编辑态
```

**同 packageId 已存在**：以「打开」为准覆盖浏览器副本（本地优先），并刷新 binding。

### 5.2 新建工作包

```
「新建并绑定文件夹」
  → 创建空 Article（新 packageId）
  → showDirectoryPicker（用户选空目录或任意目录）
  → 写出初始：manifest.json + 空三区 文稿.md + 空 assets/
  → 绑定 handle
```

也可：先纯浏览器新建，稍后再「绑定文件夹 / 保存到本地」。

### 5.3 从本地更新（拉）

策略：**本地优先**，覆盖网站对应字段。

```
「从本地更新」
  → ensurePermission('read')
  → 读 manifest、文稿.md、article.html、列 assets/
  → 对比 sha256 或 (size + lastModified)：
       新文件 / 变更文件 → 更新 IndexedDB blob + manifest
       磁盘已删、网站仍有 → 标记 orphan，弹确认是否删 IDB
  → 文稿.md → 覆盖 cover/body/notes
  → article.html 若变更 → 追加 htmlVersion
  → lastSyncedAt = now
```

差异摘要 UI：列出「文稿变更 / HTML 变更 / 新增 N 图 / 更新 M 图 / 删除候选」。

### 5.4 保存到本地（推）

策略：**网站优先**，覆盖磁盘文件。

```
「保存到本地」
  → ensurePermission('readwrite')
  → 写 manifest.json（updatedAt、assets 全量）
  → 写 文稿.md（相对路径）
  → 写 article.html（当前 active，asset 形态）
  → 同步 assets/：
       IDB 有 → 写入/覆盖对应 path
       磁盘有、manifest 无 → 删除或移入 _orphan/（v1：删除前提示）
  → lastSyncedAt = now
```

### 5.5 文稿内上传图片

见 §4.3：有绑定则双写；无绑定仅 IDB，下次「保存到本地」再落盘。

### 5.6 冲突（两边都改）

v1 **不做静默三路合并**：

- 点「从本地更新」前若 `dirty`（网站未保存编辑）→ 确认会丢网站未保存内容
- 点「保存到本地」前可扫本地 `updatedAt` / 文件 mtime；若本地更新 → 警告「将覆盖本地，建议先更新」

---

## 6. UI 改动（文稿管理为主）

`DocumentsView` 建议按钮组：

| 按钮 | 行为 |
|------|------|
| 打开工作包 | §5.1 |
| 新建文稿 | 纯浏览器；可稍后绑定 |
| 绑定文件夹 / 另存到文件夹 | 无 handle 时 |
| 从本地更新 | 有 handle |
| 保存到本地 | 有 handle |
| 解绑 | 只删 handles 记录，不删文件夹 |

保留（可降级）：

- 复制 Markdown（相对路径版，**不含二进制**——提示需工作包才完整）
- 上传单个 HTML（作为「仅导入 HTML 版本」，不建包）

工作台（HtmlPreview）：

- 导出 HTML：仍可单文件下载（无图）；旁注「完整请用保存到本地」
- PNG 导出逻辑不变（已 resolve blob）

状态条：`已绑定：{folderName} · 上次同步 {time}` / `未绑定文件夹`。

---

## 7. 权限与兼容性

| 能力 | 要求 |
|------|------|
| Directory Handle + 持久化 | Chromium（Chrome / Edge）；用户手势触发 picker |
| Firefox / Safari | v1：**不支持句柄**；可只做「浏览器内编辑」；或后续再考虑 zip 兜底（本次明确不做） |

实现注意：

- Handle 存 IDB 后，下次打开常需再 `requestPermission`（用户手势按钮上触发）
- 权限失败 → 清晰文案：「请点击重新授权」

`env.d.ts` 需补全：`showDirectoryPicker`、`FileSystemDirectoryHandle`、`getDirectoryHandle` / `getFileHandle` / `removeEntry`、`values()` 迭代等。

---

## 8. Skill / 本地 AI 约定（同步改 `skill-pack/SKILL.md`）

工作区固定文件：

| 文件 | 作用 |
|------|------|
| `manifest.json` | 映射；本地 AI **尽量不手改 id**；新增图可只加文件，由网站更新时补 id |
| `文稿.md` | 三区；插图 `./assets/...` |
| `article.html` | 长图；`data-asset-id`，不写 src |
| `assets/` | 真实图片 |

本地 AI 工作流：

1. 读 `文稿.md` + 需要时 Read `assets/*` 看图
2. 改文案 / 在 `assets/` 放入新图并在 MD 中引用
3. 生成/改 `article.html`（用 manifest 里已有 id；新图若尚无 id，用占位说明或等用户「从本地更新」分配 id 后再排）

**推荐新图流程（清晰）**：

1. 用户把图放进 `assets/`，MD 写相对路径  
2. 网站「从本地更新」→ 分配 uuid、写 manifest、入库  
3. 再让 AI 生成/改 HTML（prompt 带配图清单）

或：网站先上传图（双写 assets + manifest），再本地 AI 排版。

---

## 9. 安全与校验

- `path` 仅允许 `[A-Za-z0-9\u4e00-\u9fff._\-]+` 文件名（含中文），禁止路径分隔符、空白与 `..`
- 单图大小上限（建议 15–20MB）、包内图数量上限
- MIME 白名单：`image/png|jpeg|webp|gif`
- 写盘前校验 manifest.assets 与 IDB / 文件一致性，坏包报错不静默吞

---

## 10. 重构分期

### Phase A — 数据层（无 UI 句柄也可先做）

1. 合并 IndexedDB schema（articles + assets + meta）
2. 去掉 localStorage 文稿主存；启动空库
3. `md-bridge`：相对路径 ↔ `asset://`
4. `manifest` 读写与校验
5. 改 `ArticleRichEditor` 上传：写入 `path` 字段；无 handle 只 IDB

### Phase B — 文件夹 I/O

1. `import-folder` / `export-folder`
2. DocumentsView：「打开工作包」「保存到本地」「从本地更新」
3. 绑定状态展示与授权按钮
4. 更新 Skill 文档与示例测试文件夹结构（加 `manifest.json` + `assets/`）

### Phase C — 双写与体验

1. 上传图片时若已绑定 → 立即写 `assets/` + `manifest.json`
2. dirty / 冲突提示
3. orphan 清理 UX

---

## 11. 明确不做（v1）

- zip 导入导出
- 兼容旧 localStorage / 旧独立 assets DB
- 磁盘上保留全部 HTML 历史版本
- Firefox/Safari 文件夹句柄
- 把聊天记录打进工作包
- HTML 内同时写 `src="./assets/..."` 与 `data-asset-id`（避免双源）

---

## 12. 验收标准

1. 选本地文件夹打开 → 网站出现文稿，配图可预览  
2. 网站改字、上传图 →「保存到本地」后，文件夹内 MD/HTML/assets/manifest 正确  
3. Cursor 改 MD、往 assets 加图 →「从本地更新」后网站文稿与图齐全  
4. 本地 AI 能通过相对路径 Read 到图片文件  
5. 导出 PNG 长图含正确配图  
6. 刷新浏览器后，经「重新授权」仍能对同一文件夹更新/保存  

---

## 13. 关键决策备忘

| 决策 | 结论 |
|------|------|
| 包格式 | **仅文件夹** |
| 身份 | `manifest.packageId` ≡ `Article.id` |
| MD 插图 | `./assets/文件名` |
| HTML 插图 | 仅 `data-asset-id`（+ 运行时 blob） |
| 同步方向 | 更新=本地赢；保存=网站赢 |
| HTML 多版本 | 网站保留；磁盘只写 active |
| 旧数据 | 不迁移，清空重来 |
