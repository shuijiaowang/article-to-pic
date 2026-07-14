# article-to-pic

## 已做/代做
1. 新建文稿
2. 编辑器页面
3. 初始化 AI API
4. 封装 html-editor-agent

deepseek 的 api  
阿里的 api，可以直接反馈图片

选中区域指定修改。  
可视化编辑颗粒度精细。

## HTML 生成约定

主要提示词（纯文案、无逻辑）在 `prompts/`，说明见 `prompts/README.md`。

- `src/prompts/index.ts` — 加载并拼装
- `src/services/ai-html.ts` — 调用逻辑
- `template/template.html` — 参考模板

要点：每页 `.page-wrap > .page`（1080×1440）；页内 HTML/CSS 自定；配图用 `data-asset-id`，不写 src/base64。
