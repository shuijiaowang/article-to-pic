---
name: article-to-pic
description: >-
  为 Article to Pic 长图文创作文稿与 HTML。本地 AI 负责写/改 文稿.md、article.html 与工作包配图；
  网站负责预览、可视化编辑、导出 PNG、与本地文件夹双向同步。在用户要创作长图文、生成长图 HTML、
  处理工作包配图，或提到 Article to Pic / 文稿.md / article.html / manifest.json / assets 时使用。
---

# Article to Pic 本地创作

## 分工

- **本地 AI（你）**：写/改 `文稿.md`，管理 `assets/` 配图引用，根据文稿生成或修改 `article.html`
- **网站**：预览、可视化编辑、导出 1080×1440 PNG；绑定工作包后与本地文件夹双向同步

## 工作区约定

工作包根目录固定结构，**不要改名核心文件**：

| 文件 / 目录 | 作用 |
|-------------|------|
| `manifest.json` | 图片 UUID ↔ 文件名映射（由网站维护 id，本地 AI 只读） |
| `文稿.md` | 三区格式 Markdown 文稿（插图用 `./assets/...`） |
| `article.html` | 长图 HTML（完整单文件） |
| `assets/` | 真实图片文件（png / jpeg / webp / gif） |
| `SKILL.md` | 本说明（不参与同步逻辑） |

**不存在 → 创建；已存在 → 在原有基础上修改**，不要无故重建或换文件名。

可选：把本文件放到 `.cursor/skills/article-to-pic/SKILL.md`，Cursor 可自动发现。

## 标准流程

1. 根据用户需求写或改 `文稿.md`（三区格式见下）
2. 需要配图时：把图片放入 `assets/`，在文稿中用相对路径引用（见「工作包配图与同步」）
3. 读取 `文稿.md` 与 `manifest.json`，生成或更新 `article.html`
4. 用户按需微调排版（直接改 HTML 文件）
5. 提醒用户：在网站绑定工作包后点 **「从本地更新」** 同步；或上传 `article.html` 预览 / 编辑 / 导出 PNG

---

## 工作包配图与同步

### 目录与职责

```
{工作包}/
├── manifest.json    # id → assets/ 内文件名；网站分配 UUID
├── 文稿.md          # 插图：./assets/xxx
├── article.html     # 插图：data-asset-id（与 manifest 的 key 一致）
└── assets/          # 二进制图片
```

| 层 | 文稿插图 | HTML 插图 | 二进制 |
|----|----------|-----------|--------|
| 磁盘工作包 | `./assets/xxx` | `data-asset-id` only | `assets/*` 文件 |
| 网站运行时 | `asset://id` | `data-asset-id` + blob | IndexedDB |

**核心原则**：`manifest.json` 做翻译表——把 `assets/` 里的文件名和 HTML 里的 `data-asset-id` 对上。本地直接打开 `article.html` **不会显示图**；看图靠读 `assets/` 文件，或在网站预览。

### 本地 AI 该做什么 / 不该做什么

**你该做**
- 把新图放进 `assets/`（文件名只用字母、数字、`.`、`_`、`-`）
- 在 `文稿.md` 用相对路径引用：`![说明](./assets/step-01.png "width=800 height=1200")`
- 生成 `article.html` 时，为每张图写 `data-asset-id`、`data-width`、`data-height`（与 manifest 中已有 id 一致）
- 排版前 **读取 `manifest.json`**，按 path 找到对应 id；需要时 **读取 `assets/` 里的图片** 辅助构图
- 新图尚无 id 时：先在文稿里写好 `./assets/...` 引用，HTML 里用 `【配图：文件名】` 占位，或等用户网站「从本地更新」后再补 `data-asset-id`

**你不要做**
- **不要手改或伪造 `manifest.json` 里的 UUID**（id 由网站「从本地更新」或「保存到本地」维护）
- 不要删改已有 `data-asset-id`（除非整张图从文稿和 HTML 中移除）
- 不要在文稿或 HTML 里写 `asset://`、`http(s):`、绝对路径、base64、`src`

### 文稿插图格式

```markdown
![封面示意](./assets/cover.webp "width=1080 height=720")
```

- 只允许 `./assets/{filename}` 或 `assets/{filename}`
- title 里带 `width=` / `height=`（像素，与图片实际尺寸一致为佳）
- 尚无实体文件时可用 `【配图：说明】` 占位，待用户补图后再改成上式

### HTML 与 manifest 对齐

1. 打开 `manifest.json`，找到 `assets` 里每个 id 及其 `path`、`width`、`height`
2. 文稿中 `./assets/{path}` 对应的 HTML 插图应使用**同一个 id**：

```html
<div data-id="fig-step-01" data-asset-id="a1b2c3d4-..." data-width="800" data-height="1200">
  <img data-asset-id="a1b2c3d4-..." data-width="800" data-height="1200" alt="步骤示意"
       style="width:100%;display:block;border-radius:12px;">
</div>
```

3. `path` 改名时只改 manifest 的 `path`（由网站处理）；**id 不变**，HTML 里的 `data-asset-id` 也不变

### 新图推荐流程

**路线 A — 本地优先（常用）**

1. 用户或你把图放入 `assets/`，在 `文稿.md` 写好 `./assets/...` 引用
2. 提醒用户在网站点 **「从本地更新」** → 网站扫描 `assets/`、分配 UUID、写入 manifest、入库
3. 你再读更新后的 `manifest.json`，生成或补全 `article.html` 里的 `data-asset-id`

**路线 B — 网站优先**

1. 用户在网站上传图片（已绑定工作包时会双写 `assets/` + `manifest.json`）
2. 你读本地 `manifest.json` 与 `assets/`，直接按已有 id 排版 HTML

### 网站同步操作

| 方向 | 用户操作 | 效果 |
|------|----------|------|
| 本地 → 网站 | **从本地更新** | 读 `assets/`、`manifest.json`、`文稿.md`、`article.html` 覆盖网站 |
| 网站 → 本地 | **保存到本地** | 把网站状态写回文件夹，重写 `manifest.json` |

提醒用户：需 Chrome / Edge 绑定工作包文件夹；本地改完后要点 **「从本地更新」** 才会进网站，不是改磁盘就自动同步。

### 常见错误

| 问题 | 原因 | 处理 |
|------|------|------|
| 网站看不到新图 | 只改了 manifest，文件不在 `assets/` | 确认文件在 `assets/`，再「从本地更新」 |
| HTML 图裂了 | `data-asset-id` 与 manifest 的 key 不一致 | 以 manifest 为准改 HTML |
| 文稿有图、HTML 无图 | 未根据 manifest 生成 HTML | 读 manifest 补 `data-asset-id` |
| 路径对不上 | 文稿写 `./assets/a.png`，磁盘是 `b.png` | 统一文件名与 manifest.path |

---

## 文稿格式（`文稿.md`）

三个二级标题必须原样写成：`## 封面区`、`## 正文区`、`## 备注区`（不要改名、不要翻译）。

```markdown
# {文稿标题}

## 封面区

{封面文案}

## 正文区

{正文}

## 备注区

{备注}
```

### 各区怎么写

**标题（`# …`）**
- 一句说清主题，建议 10～20 字
- 这是文档名；封面区可再写更适合排版的主标题

**封面区**
- 只服务封面页，不要写长段正文
- 建议分行写清：主标题、副标题、标签、氛围 / 风格
- 短句、留白感强，方便做成一页封面

**正文区**
- 完整、可排版的正文；开头 2～3 句点题，中间分节，结尾收束或给行动建议
- 支持 `#` / `##` / `###` 分节，`-` 列表、`1.` 步骤、`>` 引用、`**加粗**`、`---` 分隔
- 有实体图时用 `![说明](./assets/xxx.png "width=… height=…")`；尚无图时用 `【配图：说明】` 占位（见「工作包配图与同步」）
- 单段不宜过长；并列用列表，步骤用有序列表
- 正文标题不要写成「封面区 / 正文区 / 备注区」
- 不要依赖表格；不要用 `####` 及更深标题

**备注区**
- 写给排版 / 生成长图用的全局约束，通常不当正文印刷
- 建议包含：目标平台、整体风格与配色、分页建议、配图待补清单、语气与受众
- 分页可按「第 N 页：……」列出

**质量**
- 面向真实读者，口语清晰，少堆术语
- 信息有层次，方便按屏分页
- 未说明平台时默认「小红书长图文 + 清爽教程向」

写文稿时只输出 Markdown 全文，不要包在代码块里，不要追加本说明。

---

## HTML 格式（`article.html`）

输出**完整 HTML 文件**（`<!DOCTYPE html>` 到 `</html>`），直接写入 `article.html`。

### 分页骨架（必须遵守）

```
body
  └── .doc-scroll
        └── #doc
              └── .page-wrap
                    └── .page[data-page]
                          └── 页内排版单元（带 data-id）
```

- 每页画布 **1080×1440 px**；装不下就新开 `.page-wrap > .page`
- 第 1 页可用 `class="page page--cover"`；正文从第 2 页起流水排版
- 主要排版单元放在 `.page` 的直接子节点，并带 `data-id`
- 页内 HTML、自定义 class 自定（标题、段落、列表、卡片、网格、引用、装饰等）
- 样式写在 `head <style>` 和/或元素 `inline style`

### 预览缩放（必须保留）

- `:root` 设 `--preview-scale`（如 `0.38`）
- `.page-wrap` 用 `transform: scale(var(--preview-scale))` 和 `margin-right: calc(1080px * (var(--preview-scale) - 1))`
- `margin-bottom` 须在 `</body>` 前用内联 script 按页高计算（新建 HTML 时参考常见长图模板写法）
- 不要删掉预览布局相关 script

### 样式

- 可在 `<style>` 定义 class，也可用 inline style
- 优先改 `#doc` 内结构与 inline style；需要时可增改 `head <style>`
- 常用：font-size, color, font-weight, line-height, margin, padding, background, text-align, border-radius, display, flex, grid, gap

### 配图

- 每张图保留 `data-asset-id`、`data-width`、`data-height`（像素）；**不要写 src / base64**
- `data-asset-id` 必须与 `manifest.json` 里 `assets` 的 key 一致（生成前先读 manifest）
- 图片放在带 `data-id` 的页内单元中；外层单元与内层 `<img>` 都带相同的 data 属性
- 横图常用 `width:100%`；竖图或超高图缩小 width% 或单独一页
- 改尺寸时改容器或 img 的 width/max-width，不要删/改 `data-asset-id`

### 生成要求

1. 根据 `文稿.md` 三区内容填满 `#doc`
2. 封面区 → 第 1 页；正文区 → 后续页按顺序排版；备注区作全局约束，一般不直接成文
3. 页内版式按长图文自行设计，像 AI 生成的 PPT 一样自由
4. 只输出 HTML 源码写入文件，不要 markdown 代码块，不要解释文字

---

## 修改 HTML

本地直接修改 `article.html` 完整文件（不要用 JSON patch）。

可改范围：
- `#doc` 内：增删 `.page-wrap` / `.page`、改页内结构与文字、改 style
- 保持分页骨架 `.page-wrap` / `.page`；勿动与需求无关的预览 script

### 修溢出

某页放不下 → 从溢出处起，把放不下的内容单元移到**紧邻下一页顶部**：
- 后面已有下一页 → 移到该页现有内容**之前**
- 后面没有页 → 在当前页正下方**插入**新 `.page-wrap > .page`

可以：微调字号/间距、拆分为多个 `data-id` 单元、图片缩小或移到下一页。
禁止：把溢出内容搬到非紧邻页、改变全文内容顺序、拆掉分页骨架。

---

## 收尾

HTML 完成后，提醒用户：

> 若已绑定工作包：在 Article to Pic 网站点 **「从本地更新」** 同步本地修改，再预览、可视化编辑、导出 PNG。
>
> 若未绑定：将 `article.html` 上传到网站，或先 **打开 / 新建工作包** 绑定本文件夹后再同步。

配图有新增或变更时，一并提醒确认 `assets/` 内文件齐全，且已在网站执行 **「从本地更新」**。
