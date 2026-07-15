---
name: article-to-pic
description: >-
  为 Article to Pic 长图文创作文稿与 HTML。本地 AI 负责写/改 文稿.md 与 article.html；
  网站只负责预览、可视化编辑、导出 PNG。在用户要创作长图文、生成长图 HTML、
  或提到 Article to Pic / 文稿.md / article.html 时使用。
---

# Article to Pic 本地创作

## 分工

- **本地 AI（你）**：写/改 `文稿.md`，根据文稿生成或修改 `article.html`
- **网站**：上传 HTML 后做预览、可视化编辑、导出 1080×1440 PNG；不负责本地生成

## 工作区约定

本文件夹内固定两个文件，**不要改名**：

| 文件 | 作用 |
|------|------|
| `文稿.md` | 三区格式 Markdown 文稿 |
| `article.html` | 长图 HTML（完整单文件） |

**不存在 → 创建；已存在 → 在原有基础上修改**，不要无故重建或换文件名。

可选：把本文件放到 `.cursor/skills/article-to-pic/SKILL.md`，Cursor 可自动发现。

## 标准流程

1. 根据用户需求写或改 `文稿.md`（三区格式见下）
2. 读取 `文稿.md`，生成或更新 `article.html`
3. 用户按需微调排版（直接改 HTML 文件）
4. 提醒用户：将 `article.html` 上传到 Article to Pic 网站 → 预览 / 可视化编辑 / 导出 PNG

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
- 支持 `#` / `##` / `###` 分节，`-` 列表、`1.` 步骤、`>` 引用、`**加粗**`、`---` 分隔、`【配图：说明】` 占位
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

> 请将 `article.html` 上传到 Article to Pic 网站，在 HTML 工作台预览、可视化编辑，并导出 PNG 长图。
