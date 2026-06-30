/** 图片块规则 — 供 AI system prompt 与 patch 提示共用 */
export const IMG_BLOCK_RULES_TEXT = `【图片块 .block.img】
- 文稿中 <img data-asset-id> 或 src="asset://…" 的每张图，须对应一个 .block.img，并保留 data-asset-id、data-width、data-height（像素尺寸，供排版参考）。
- 不要写 src、base64；用 data-asset-id 引用即可。
- 必须写 data-placeholder（简短说明，尚未加载图时显示）。
- 推荐结构：外层 .block.img 与内层 <img> 都带相同的 data-asset-id / data-width / data-height / alt。
- 允许调整：图片在哪一页、段落前后顺序、块 style（margin、padding、text-align 左/中/右、width、max-width、border-radius）。
- 内层 <img> 的 style 可设 width（如 100%、70%）、height:auto、border-radius；用 width 控制显示大小，用 text-align + width% 控制居中/缩进。
- 依 data-width/data-height 规划：横图（宽≥高）常用 width:100%；竖图或超高图缩小 width% 或单独占一页，避免一页溢出。
- 封面页可使用 .block.img 大图，style 可更自由。
- 用户要求改图片大小时，优先改 .block.img 或内层 img 的 width/max-width、margin、text-align，不要改 data-asset-id。`

export const STYLE_WHITELIST_TEXT = `style 白名单：font-size, color, font-weight, line-height, letter-spacing,
margin-top, margin-bottom, padding, background-color, text-align, border-radius,
width, max-width`
