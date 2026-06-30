# article-to-pic
## 已做/代做
1。新建文稿
2。编辑器页面
3.初始化AI的api接口
4.封装html-editor-agent

deepseek的api
阿里的api，可以直接反馈图片

选中区域指定修改。
可视化编辑颗粒度精细。

## 生成HTML时的提示词
with-logging.ts:18 systemPrompt: 你是 TextToPic 长图文 HTML 生成助手。

任务：根据用户文稿，输出一份**完整可直接保存的 HTML 文件**（从 <!DOCTYPE html> 到 </html>）。

输出要求：
- 只输出 HTML 源码，不要 markdown 代码块，不要解释文字
- 结构同参考模板：head（含 style）、body > .doc-scroll > #doc > .page-wrap / .page / .block
- #doc 内根据文稿生成全部页面；可在 head/style 内调整或扩展样式（封面、块、图片等）

排版：
- 画布 1080×1440 px/页；第 1 页 class="page page--cover"，正文从第 2 页起
- 块类型：class="block" + cover-title|cover-sub|cover-tag|h1|h2|text|li|quote|img
- 每块需 data-id；每页 class="page" data-page="页码"

style 白名单：font-size, color, font-weight, line-height, letter-spacing,
margin-top, margin-bottom, padding, background-color, text-align, border-radius,
width, max-width

【图片块 .block.img】
- 文稿中 <img data-asset-id> 或 src="asset://…" 的每张图，须对应一个 .block.img，并保留 data-asset-id、data-width、data-height（像素尺寸，供排版参考）。
- 不要写 src、base64；用 data-asset-id 引用即可。
- 必须写 data-placeholder（简短说明，尚未加载图时显示）。
- 推荐结构：外层 .block.img 与内层 <img> 都带相同的 data-asset-id / data-width / data-height / alt。
- 允许调整：图片在哪一页、段落前后顺序、块 style（margin、padding、text-align 左/中/右、width、max-width、border-radius）。
- 内层 <img> 的 style 可设 width（如 100%、70%）、height:auto、border-radius；用 width 控制显示大小，用 text-align + width% 控制居中/缩进。
- 依 data-width/data-height 规划：横图（宽≥高）常用 width:100%；竖图或超高图缩小 width% 或单独占一页，避免一页溢出。
- 封面页可使用 .block.img 大图，style 可更自由。
- 用户要求改图片大小时，优先改 .block.img 或内层 img 的 width/max-width、margin、text-align，不要改 data-asset-id。

userInput: 请根据下方文稿，参考模板 HTML 的结构与样式规范，生成一份**新的完整 HTML 文件**。
#doc 内示例内容全部替换为根据文稿排版的结果；head/style 可在规范内自由优化。

文稿标题：VibeCoding 崩溃实录，不要再骂AI了...

文稿正文（HTML，含标题/列表/引用/图片引用等）：
<p>首页封面：</p><img src="asset://4b566ce5-cf93-4bc9-a5fe-6a6b8af5c698" alt="OIP-C (3)" data-asset-id="4b566ce5-cf93-4bc9-a5fe-6a6b8af5c698" data-width="124" data-height="108"><p>VibeCoding 崩溃实录，不要再骂AI了...</p><p>AI生成代码出错时，需警惕情绪污染、安全护栏及注意力干扰，及时止损并调整策略。</p><p>正文：</p><p>这两天vibecoding时候，陷入了两次怪圈，AI生成的代码有问题一直测试失败，然后一直改一直改来回七八遍改的我心累，很难忍不住<mark>破口大骂</mark>：</p><p></p><blockquote><p>改了这好几次了都没用，我真是服了。</p><p>你这不脱裤子放屁，我线上没有更新程序的话这图片都上传不了，肯定是其他问题啊。</p><p>别**想你的测试，把自己绕死了半天憋不出来个*，你就说是哪里的问题。</p><p>不行就是不行，别再给我写这玩意了，把我当**啊。</p><p>重新上线了重启了，不行就不行，联网给我查资料**。</p><p>你可真**能编，我这里线上要是不对我还用个蛋。</p><p>**，你给我打日志啊，瞎**乱写乱想。</p><p>你这一改，我自己网站都不走go程序了，都走静态的，改了些*。</p><p>行了我没有耐心了，**，改了个屁的也没用，*****......</p></blockquote><h2>然后去查了一下这是为什么呢？为什么骂了感觉更输出的质量更差劲了？</h2><p>1，训练数据的“情绪污染”</p><p>        你骂它的时候，它脑子里闪过的全是网上那些对骂、抬杠、没营养的废话，因为它学过的样本里，<strong><mark>脏话往往和“垃圾内容”掺合在一起</mark></strong>。所以它接出来的话，自然就空洞、跑偏，像个被带偏的复读机，输出内容就越没营养。</p><p>2，AI程序带有“安全护栏“</p><p>        AI系统检测到攻击性词汇，会倾向于“闭麦保平安,只敢说没用的客气话，<mark>反复道歉或者车轱辘话来回转</mark>。不是它想敷衍你，是系统强制它“别惹事”，结果反而显得又怂又笨。</p><p>3，上下文语义的“注意力干扰”</p><p>        AI核心机制是预测下一个最合理的词，脏话和情绪词一多，<mark>它的“注意力”全被这些词儿吸走了</mark>，根本没空去管你到底想问什么正经事。不得不花费大量算力去“消化”这些负面情绪，反而稀释了对你真正任务诉求的关注度，导致逻辑链断裂或回答跑偏。就像你一边听人骂街一边做题，脑子嗡嗡的，公式都记不住，回答能不跑偏吗？</p><h2>遇到这种情况我的个人建议是：</h2><p>1.让<mark>AI联网</mark>搜解决办法，打日志，手动调试，给AI真实客观的数据。</p><p>2.代码回滚，直接舍弃本次AI的输出，AI已经生成了错误的代码会持续污染，<mark>及时止损</mark>。</p><p>3.总结并开一个<mark>新的干净的对话</mark>从头再来，冷静客观的描述，脱离之前的上下文干扰。</p><p>4.<mark>切换另一个AI模型</mark>，可能这家的AI对这种问题的训练不足。</p><p></p>

【文稿配图清单】每张图对应一个 .block.img，保留 data-asset-id / data-width / data-height，不要写 src：
1. data-asset-id="4b566ce5-cf93-4bc9-a5fe-6a6b8af5c698" | 124×108px | 横图，宽高比 1.148，说明「OIP-C (3)」

生成要求：
1. 输出完整 HTML 文档，不要只输出 #doc 片段
2. 第 1 页封面 page--cover，正文从第 2 页起，每页 1080×1440，过多则新开 .page
3. 正文 HTML 语义映射为 .block（h1/h2→.block.h1/.h2，p→.block.text，列表→.block.li 等）
4. 配图清单中每张图对应 .block.img，保留 data-asset-id / data-width / data-height，不要写 src/base64
5. 根据图片尺寸与宽高比决定 width% 与分页；封面与图片位置可在规范内自由排版
6. 参考下列模板（结构、class、样式约定）；#doc 内示例需完全替换为你的排版

【参考模板 HTML】
<!DOCTYPE html>
<html lang="zh-CN"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TextToPic 模板</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      /* 预览缩放比（仅屏幕显示）；导出仍为 1080×1440，见 texttopic.js */
      --preview-scale: 0.38;
    }

    body {
      background: #e8e8e8;
      font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
      min-height: 100vh;
    }

    /* ---------- 预览区：缩小显示，水平排布可左右滚动 ---------- */
    .doc-scroll {
      overflow: auto;
      padding: 24px;
    }

    #doc {
      display: flex;
      flex-direction: row;
      align-items: flex-start;
      gap: 24px;
      width: max-content;
      min-width: 100%;
      justify-content: center;
    }

    /* ---------- 单页：逻辑宽 1080，导出高 1440；溢出内容可见不裁剪 ---------- */
    .page {
      width: 1080px;
      min-height: 1440px;
      background: #ffffff;
      padding: 80px 72px;
      overflow: visible;
      flex-shrink: 0;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
      position: relative;
    }

    /* 1440px 导出边界线（仅溢出页显示） */
    .page.page--overflow::before {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 1440px;
      border-top: 2px dashed #ef4444;
      pointer-events: none;
      z-index: 1;
    }

    /* 超出导出区域的块 */
    .block.block--overflow {
      outline: 2px dashed #ef4444;
      outline-offset: 4px;
    }

    .page-wrap {
      flex-shrink: 0;
      width: 1080px;
      transform: scale(var(--preview-scale));
      transform-origin: top left;
    }

    /* 导出时移出视口、取消缩放 */
    .page-wrap.is-exporting {
      transform: none !important;
      position: fixed !important;
      left: -9999px !important;
      top: 0 !important;
      margin: 0 !important;
    }

    .page.page--overflow {
      box-shadow: 0 0 0 4px #ef4444, 0 4px 24px rgba(0, 0, 0, 0.12);
    }

    /* ---------- 封面页：默认居中，具体风格由 AI inline style 覆盖 ---------- */
    .page.page--cover {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 1440px;
      padding: 96px 72px;
    }

    .page-label {
      text-align: center;
      font-size: 13px;
      color: #888;
      margin-bottom: 8px;
    }

    /* ---------- 块类型 ---------- */
    .block { width: 100%; }

    /* 封面块：以下为默认基准，AI 可用 inline style 改字号/颜色/间距等 */
    .block.cover-title {
      font-size: 88px;
      font-weight: 800;
      line-height: 1.2;
      color: #1a1a1a;
      margin-bottom: 36px;
    }

    .block.cover-sub {
      font-size: 48px;
      font-weight: 500;
      line-height: 1.45;
      color: #444444;
      margin-bottom: 32px;
    }

    .block.cover-tag {
      font-size: 34px;
      font-weight: 600;
      line-height: 1.4;
      color: #888888;
      margin-bottom: 0;
    }

    .block.h1 {
      font-size: 64px;
      font-weight: 700;
      line-height: 1.3;
      color: #1a1a1a;
      margin-bottom: 32px;
    }

    .block.h2 {
      font-size: 52px;
      font-weight: 600;
      line-height: 1.35;
      color: #1a1a1a;
      margin-bottom: 24px;
    }

    .block.text {
      font-size: 42px;
      font-weight: 400;
      line-height: 1.6;
      color: #333333;
      margin-bottom: 24px;
    }

    .block.li {
      font-size: 42px;
      line-height: 1.6;
      color: #333333;
      margin-bottom: 16px;
      padding-left: 48px;
      position: relative;
    }

    .block.li::before {
      content: "•";
      position: absolute;
      left: 8px;
      color: #333333;
    }

    .block.quote {
      font-size: 38px;
      line-height: 1.55;
      color: #555555;
      margin-bottom: 24px;
      padding-left: 24px;
      border-left: 6px solid #dddddd;
    }

    .block.img {
      margin-bottom: 24px;
      min-height: 120px;
      background: #f0f0f0;
      border: 2px dashed #cccccc;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #999999;
      font-size: 28px;
      text-align: center;
      padding: 24px;
      cursor: pointer;
    }

    /* 有 data-asset-id 且已加载 img 时隐藏占位虚线框感 */
    .block.img:has(img) {
      background: transparent;
      border: none;
      min-height: 0;
      padding: 0;
      cursor: default;
    }

    .block.img:hover { border-color: #aa3bff; }

    .block.img img {
      display: block;
      width: 100%;
      height: auto;
      border-radius: 8px;
      pointer-events: none;
    }

    .block.img .placeholder-hint {
      pointer-events: none;
      line-height: 1.4;
    }
  </style>
</head>
<body>

  <div class="doc-scroll">
    <div id="doc">

      <div class="page-wrap">
        <div class="page-label">第 1 页 · 封面（style 可自由改）</div>
        <div class="page page--cover" data-page="1" style="background-color: #faf8ff; text-align: left;">
          <div class="block cover-tag" data-id="cover-tag" style="color: #aa3bff; font-size: 32px; margin-bottom: 24px; letter-spacing: 0.08em;">示例 · 干货</div>
          <div class="block cover-title" data-id="cover-title" style="font-size: 92px; line-height: 1.15; margin-bottom: 40px;">结构化写作<br><span style="color: #aa3bff;">入门指南</span></div>
          <div class="block cover-sub" data-id="cover-sub" style="font-size: 44px; color: #555; font-weight: 400; max-width: 900px;">
            用清晰的层次和节奏，把复杂想法变成易读、易分享的长图文
          </div>
        </div>
      </div>

      <div class="page-wrap">
        <div class="page-label">第 2 页</div>
        <div class="page" data-page="2">
          <div class="block h1" data-id="p2-h1">三分钟读懂结构化写作</div>
          <div class="block text" data-id="p2-intro">
            很多人写长文时容易想到哪写到哪，读者看完却抓不住重点。结构化写作并不复杂——核心是把信息分层、分段、分点，让读者一眼知道「这篇在讲什么」。
          </div>
          <div class="block text" data-id="p2-lead">
            下面用三个常见场景，说明怎么快速搭好一篇文章的骨架。
          </div>
          <div class="block h2" data-id="p2-h2">一、先定封面，再写正文</div>
          <div class="block text" data-id="p2-body">
            长图文的第一页通常是封面，只需要三样东西：
          </div>
          <div class="block li" data-id="p2-li1">一句主标题：说清主题，尽量控制在 15 字以内</div>
          <div class="block li" data-id="p2-li2">一句副标题：补充背景或价值，引发好奇</div>
          <div class="block li" data-id="p2-li3">一个标签：如「干货」「指南」「读书笔记」，帮助分类</div>
          <div class="block text" data-id="p2-note">
            封面不写长段落，正文从第二页开始展开。
          </div>
        </div>
      </div>

      <div class="page-wrap">
        <div class="page-label">第 3 页</div>
        <div class="page" data-page="3">
          <div class="block h2" data-id="p3-h2">二、正文用「总—分—总」</div>
          <div class="block text" data-id="p3-intro">推荐结构：</div>
          <div class="block li" data-id="p3-li1">开头用 2～3 句话点题，告诉读者为什么要看</div>
          <div class="block li" data-id="p3-li2">中间分 2～4 个小节，每节一个小标题 + 若干段落或列表</div>
          <div class="block li" data-id="p3-li3">结尾收束观点，或给出可执行的建议</div>
          <div class="block quote" data-id="p3-quote">好结构不是限制创意，而是帮读者在 30 秒内建立预期，愿意继续往下读。</div>
          <div class="block h2" data-id="p3-h2b">三、列表与引用，让页面更好排版</div>
          <div class="block li" data-id="p3-li4">并列信息 → 用无序列表</div>
          <div class="block li" data-id="p3-li5">步骤流程 → 用有序列表</div>
          <div class="block li" data-id="p3-li6">金句观点 → 单独成段，或标记为引用块</div>
          <div class="block text" data-id="p3-tip">
            转成长图时，列表和短段落更容易分页，避免某一页文字过密。
          </div>
          <div class="block text" data-id="p3-highlight" style="background-color: #fff3bf; padding: 8px 12px;">
            你可以直接编辑这篇示例，或替换为自己的内容，然后点击「生成 HTML」体验完整流程。
          </div>
        </div>
      </div>

    </div>
  </div>

</body></html>


