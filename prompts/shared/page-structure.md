【分页结构】
- 骨架：body > .doc-scroll > #doc > .page-wrap > .page[data-page]
- 画布：每页 {{CANVAS_LABEL}} px；内容装不下就新开 .page-wrap > .page
- 预览缩放：`--preview-scale` + `.page-wrap { transform: scale(...); margin-right: calc({{PAGE_W}}px * (var(--preview-scale) - 1)); }`；`margin-bottom` 须随页高在 `</body>` 前用内联 script 计算（参考 template.html），勿依赖宿主页面事后改 DOM
- 第 1 页可用 class="page page--cover"；正文从第 2 页起流水排版
- 主要排版单元放在 .page 的直接子节点上，并带 data-id（溢出测量与 patch 依赖）
- 页内 HTML 与自定义 class 自定（标题、段落、列表、卡片、网格、引用、图标、装饰等）
- 样式写在 head <style> 和/或元素 inline style
