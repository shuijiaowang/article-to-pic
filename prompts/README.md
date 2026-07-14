# AI 提示词

本目录只放**纯提示词文本**（无逻辑代码），改完保存即可生效（Vite `?raw` 加载）。

| 文件 | 用途 |
|------|------|
| `shared/page-structure.md` | 分页骨架约定（多处拼入） |
| `shared/style-hint.md` | 样式写法提示 |
| `shared/img-block.md` | 配图 data-asset-id 约定 |
| `patch-protocol.md` | 单文件 search/replace JSON 协议 |
| `multi-file-patch-protocol.md` | 多文件 patch 协议 |
| `html-editor-system.md` | HTML 编辑 system prompt（主体） |
| `html-chat-extra.md` | 对话改稿额外说明（拼在编辑 prompt 后） |
| `layout-fix-system.md` | 排版溢出修复 system prompt |
| `article-html-generation-system.md` | 文稿首次生成 HTML system prompt |

拼装入口：`src/prompts/index.ts`（仅 join / export，勿在此写长文案）。
