【分页结构】
- 骨架：body > .doc-scroll > #doc > .page-wrap > .page[data-page]
- 画布：每页 1080×1440 px；内容装不下就新开 .page-wrap > .page
- 第 1 页可用 class="page page--cover"；正文从第 2 页起流水排版
- 主要排版单元放在 .page 的直接子节点上，并带 data-id（溢出测量与 patch 依赖）
- 页内 HTML 与自定义 class 自定（标题、段落、列表、卡片、网格、引用、图标、装饰等）
- 样式写在 head <style> 和/或元素 inline style
