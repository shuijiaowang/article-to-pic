import { editHtmlWithAgent, HTML_EDITOR_SYSTEM_PROMPT } from '@/agents/html-editor-agent'
import { isAiReady } from '@/ai'
import type { AiHtmlEditResult } from '@/types/ai-patch'
import { stripPreviewScripts } from '@/utils/parse-html'
import type { LayoutReport } from '@/utils/texttopic/types'

export const HTML_CHAT_SYSTEM_PROMPT = `${HTML_EDITOR_SYSTEM_PROMPT}

额外说明（对话模式）：
- 用户可能提问（如「哪几页溢出了？」「把第 2 页标题改大」），也可能描述想要的排版效果。
- 若仅为咨询、当前 HTML 无需改动：summary 用中文直接回答，edits 为空数组。
- 若需修改：正常生成 patch，summary 简要说明做了什么。
- 修改应**针对**用户描述的范围，不要改动无关页面或块。
- 流水排版：1080×1440 分页，装不下的块接到紧邻下一页顶部继续。`

export function buildChatEditRequest(userMessage: string, report?: LayoutReport): string {
  const parts = [`【用户需求】\n${userMessage.trim()}`]

  if (report) {
    parts.push(`【当前布局概况】\n${report.summary}`)

    if (report.overflowPageCount > 0) {
      const overflowBrief = report.pages
        .filter((p) => p.overflow)
        .map(
          (p) =>
            `第 ${p.page} 页超出 ${p.overflowPx}px，溢出块 data-id: ${p.overflowBlocks.join(', ') || '—'}`,
        )
        .join('\n')
      parts.push(`【溢出详情】\n${overflowBrief}`)
    }

    parts.push(`【layoutReport 摘要 JSON】\n${JSON.stringify({
      pageCount: report.pageCount,
      overflowPageCount: report.overflowPageCount,
      pages: report.pages.map((p) => ({
        page: p.page,
        overflow: p.overflow,
        overflowPx: p.overflowPx,
        overflowBlocks: p.overflowBlocks,
        blocks: p.blocks.map((b) => ({
          dataId: b.dataId,
          type: b.type,
          textPreview: b.textPreview,
          overflowsCanvas: b.overflowsCanvas,
        })),
      })),
    }, null, 2)}`)
  }

  return parts.join('\n\n')
}

export async function editHtmlWithChat(options: {
  fileName: string
  content: string
  userMessage: string
  report?: LayoutReport
}): Promise<AiHtmlEditResult> {
  if (!isAiReady()) {
    throw new Error('AI 未配置，请先在设置页填写 API 密钥')
  }

  const request = buildChatEditRequest(options.userMessage, options.report)
  const result = await editHtmlWithAgent(
    {
      fileName: options.fileName,
      content: options.content,
      request,
    },
    { systemPrompt: HTML_CHAT_SYSTEM_PROMPT },
  )

  return {
    ...result,
    content: stripPreviewScripts(result.content),
  }
}
