import { getAiProvider } from '@/ai'
import type { AiProvider } from '@/ai/types'
import {
  applyPatchPlan,
  buildPatchPrompt,
  MAX_PATCH_RETRY,
  parsePatchResponse,
} from '@/services/ai-patch'
import type { AiHtmlEditOptions, AiHtmlEditResult } from '@/types/ai-patch'

/** TextToPic 模板 HTML 编辑约束 — 作为 Agent 的 system prompt */
export const HTML_EDITOR_SYSTEM_PROMPT = `你是 TextToPic 长图文 HTML 编辑助手。

工作方式：根据用户需求，对当前 HTML 文件生成 search/replace patch（JSON），不要返回完整文件。

修改范围：
- 只能改 #doc 内：增删 .page / .block、改文字、改 block 的 style（白名单）
- 禁止改：head/style 选择器、.toolbar、script 引用
- 不要用 p/h1 等标签代替 .block

块类型：class="block" + cover-title|cover-sub|cover-tag|h1|h2|text|li|quote|img
每块需 data-id；每页 class="page" data-page="页码"
画布 1080×1440 px/页；内容多就新开 .page

style 白名单：font-size, color, font-weight, line-height, letter-spacing,
margin-top, margin-bottom, padding, background-color, text-align, border-radius

封面页（第 1 页 class="page page--cover"）可自由搭配视觉样式，正文从第 2 页起。`

export interface HtmlEditorAgentOptions {
  provider?: AiProvider
  systemPrompt?: string
  maxRetry?: number
}

export interface HtmlEditorEditInput {
  fileName: string
  content: string
  request: string
}

/**
 * HTML 编辑器 Agent — 封装「提示词 → AI → JSON patch → 定位替换」全流程。
 */
export class HtmlEditorAgent {
  private readonly provider: AiProvider
  private readonly systemPrompt: string
  private readonly maxRetry: number

  constructor(options: HtmlEditorAgentOptions = {}) {
    this.provider = options.provider ?? getAiProvider()
    this.systemPrompt = options.systemPrompt ?? HTML_EDITOR_SYSTEM_PROMPT
    this.maxRetry = options.maxRetry ?? MAX_PATCH_RETRY
  }

  /** 是否已配置 AI（API 密钥等） */
  isReady(): boolean {
    return this.provider.isConfigured()
  }

  /** 根据用户需求修改 HTML */
  async edit(input: HtmlEditorEditInput): Promise<AiHtmlEditResult> {
    if (!this.isReady()) {
      throw new Error('AI 未配置，请先在设置页填写 API 密钥')
    }

    return this.runPatchLoop({
      fileName: input.fileName,
      content: input.content,
      request: input.request,
      maxRetry: this.maxRetry,
      systemPrefix: this.systemPrompt,
    })
  }

  private async runPatchLoop(options: AiHtmlEditOptions): Promise<AiHtmlEditResult> {
    const { fileName, content, request, maxRetry = MAX_PATCH_RETRY, systemPrefix } = options

    let currentContent = content
    let previousError: string | undefined
    let previousResponse: string | undefined
    let lastSummary = ''
    let lastApplied: string[] = []
    let lastEditResults: AiHtmlEditResult['editResults'] = []
    let attempts = 0

    const maxAttempts = maxRetry + 1

    while (attempts < maxAttempts) {
      attempts += 1

      const prompt = buildPatchPrompt({
        fileName,
        content: currentContent,
        request,
        previousError,
        previousResponse,
      })

      const raw = await this.provider.chat(prompt, {
        systemPrompt: systemPrefix,
      })

      previousResponse = raw

      try {
        const plan = parsePatchResponse(raw)
        lastSummary = plan.summary

        if (plan.edits.length === 0) {
          return {
            content: currentContent,
            summary: plan.summary || 'AI 未返回可执行的修改',
            applied: [],
            editResults: [],
            changed: false,
            attempts,
          }
        }

        const result = applyPatchPlan({
          content: currentContent,
          fileName,
          plan,
        })

        lastApplied = result.applied
        lastEditResults = result.editResults

        return {
          content: result.content,
          summary: plan.summary,
          applied: result.applied,
          editResults: result.editResults,
          changed: result.changed,
          attempts,
        }
      } catch (error) {
        previousError = error instanceof Error ? error.message : String(error)
        if (attempts >= maxAttempts) {
          throw new Error(`AI patch 应用失败（已重试 ${maxRetry} 次）：${previousError}`)
        }
      }
    }

    return {
      content: currentContent,
      summary: lastSummary,
      applied: lastApplied,
      editResults: lastEditResults,
      changed: false,
      attempts,
    }
  }
}

/** 创建默认 HtmlEditorAgent 实例 */
export function createHtmlEditorAgent(options?: HtmlEditorAgentOptions): HtmlEditorAgent {
  return new HtmlEditorAgent(options)
}

/** 便捷函数：一次性修改 HTML */
export async function editHtmlWithAgent(
  input: HtmlEditorEditInput,
  options?: HtmlEditorAgentOptions,
): Promise<AiHtmlEditResult> {
  return createHtmlEditorAgent(options).edit(input)
}
