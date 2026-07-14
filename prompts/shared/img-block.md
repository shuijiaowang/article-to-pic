【图片】
- 每张图保留 data-asset-id、data-width、data-height（像素）；不要写 src / base64
- 图片放在带 data-id 的页内单元中，常用结构：单元内一层 <img>
- 外层单元与内层 <img> 都带相同的 data-asset-id / data-width / data-height / alt；可加 data-placeholder
- 可调整：所在页、相对顺序、width%/max-width、margin、text-align、border-radius
- 横图常用 width:100%；竖图或超高图缩小 width% 或单独一页，避免溢出
- 改尺寸时改容器或 img 的 width/max-width，不要删/改 data-asset-id
