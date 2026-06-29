import { editHtmlWithAgent } from '@/agents/html-editor-agent'
import { isAiReady } from '@/ai'
import type { AiHtmlEditResult } from '@/types/ai-patch'
import { stripPreviewScripts } from '@/utils/parse-html'
import type { BlockMeasure, LayoutReport, PageMeasure } from '@/utils/texttopic/types'

export const LAYOUT_FIX_SYSTEM_PROMPT = `你是 TextToPic 长图 HTML 的排版修复助手。

这是**自上而下阅读的流水排版**：内容像一篇文章连续往下流，分页只是 1080×1440 画布的切分点，不是「每页独立设计一张海报」。
没有「每页必须一个标题一个正文」之类的结构要求。

工作方式：根据 layoutReport 生成 search/replace patch（JSON），不要返回完整文件。

【怎么修溢出】
某页放不下 → 从 overflowBlocks 起，把放不下的块移到**紧邻下一页的顶部**继续排：
- 若后面已有下一页：移到该页现有块**之前**（接在上一页流水后面）
- 若后面没有页：在当前页正下方**插入**新 .page-wrap > .page，块放在新页顶部

本页留下能放下的部分即可。下一页从溢出处接着读，读者感受是「往下续」，不是「跳去别处的空页」。

【可以做的】
- 把装不下的块移到下一页顶部（首选，符合流水）
- 必要时微调 style 白名单（margin、line-height、font-size 等），但**不必**为了消溢出硬压本页——本页堵就接到下一页
- 单块过高装不下：可拆成多个 .block 或在块边界分页

【禁止】
- 把某页溢出的块搬到**非紧邻**的 distant 页（如第 2 页溢出却塞进第 5 页）
- 改变全文块顺序（data-id 先后必须一致）
- 改动与本次溢出无关的页
- 修改 head/style 选择器、.toolbar、script

【结构】
- .page-wrap > .page[data-page]；封面 page--cover 为第 1 页
- .block[data-id] + cover-title|cover-sub|cover-tag|h1|h2|text|li|quote|img
- 移动/插入后按 DOM 顺序重排 data-page

style 白名单：font-size, color, font-weight, line-height, letter-spacing,
margin-top, margin-bottom, padding, background-color, text-align, border-radius`

function formatBlockLine(block: BlockMeasure): string {
  const parts = [
    block.dataId ?? '?',
    block.type,
    `y:${block.top}–${block.bottom}`,
  ]
  if (block.overflowsCanvas) parts.push(`超出 clip:${block.clipPx}`)
  if (block.textPreview) parts.push(`「${block.textPreview}」`)
  return `    · ${parts.join(' | ')}`
}

function describePageSituation(page: PageMeasure): string {
  const overflowIds =
    page.overflowBlocks.length > 0
      ? page.overflowBlocks.join(', ')
      : page.blocks
          .filter((b) => b.overflowsCanvas)
          .map((b) => b.dataId)
          .filter(Boolean)
          .join(', ') || '（见 overflowsCanvas）'

  return [
    `第 ${page.page} 页：超出 ${page.overflowPx}，overflowBlocks: ${overflowIds}`,
    ...page.blocks.map(formatBlockLine),
    `  → 从 overflowBlocks 起移到紧邻下一页顶部；无下一页则在第 ${page.page} 页下插入新页。不必硬压本页。`,
  ].join('\n')
}

function buildOverflowBrief(report: LayoutReport): string {
  const overflowPages = report.pages.filter((p) => p.overflow)
  if (!overflowPages.length) return '当前无溢出页。'
  return overflowPages.map(describePageSituation).join('\n\n')
}

export function buildLayoutFixRequest(report: LayoutReport): string {
  return `修复页面溢出。流水排版：装不下的接到紧邻下一页顶部继续，本页不必硬挤。

【溢出页】
${buildOverflowBrief(report)}

【layoutReport】
${JSON.stringify(report, null, 2)}

【自检】
- 每页不超出画布
- 溢出块是否在紧邻下一页顶部续排？顺序是否未乱？是否未搬到 distant 页？
- data-page 是否连续？

${report.aiHint}`
}

export async function fixLayoutWithAi(options: {
  fileName: string
  content: string
  report: LayoutReport
}): Promise<AiHtmlEditResult> {
  if (!isAiReady()) {
    throw new Error('AI 未配置，请先在设置页填写 API 密钥')
  }

  const request = buildLayoutFixRequest(options.report)
  const result = await editHtmlWithAgent(
    {
      fileName: options.fileName,
      content: options.content,
      request,
    },
    { systemPrompt: LAYOUT_FIX_SYSTEM_PROMPT },
  )

  return {
    ...result,
    content: stripPreviewScripts(result.content),
  }
}
