/**
 * AI HTML — 首次生成（完整 HTML 直出）与后续编辑（search/replace patch JSON）
 */
import { getAiProvider, isAiReady } from '@/ai'
import type { AiProvider } from '@/ai/types'
import type {
  ApplyPatchPlanOptions,
  ApplyPatchResult,
  AiHtmlEditOptions,
  AiHtmlEditResult,
  BuildMultiFilePatchPromptOptions,
  BuildPatchPromptOptions,
  CreateEdit,
  EditPlan,
  MatchMode,
  PatchEdit,
  ReplaceEdit,
} from '@/types/ai-patch'
import type { Article } from '@/types/document'
import {
  ARTICLE_HTML_GENERATION_SYSTEM_PROMPT,
  HTML_CHAT_SYSTEM_PROMPT,
  HTML_EDITOR_SYSTEM_PROMPT,
  LAYOUT_FIX_SYSTEM_PROMPT,
  MULTI_FILE_PATCH_PROTOCOL,
  PATCH_PROTOCOL,
} from '@/prompts'
import {
  extractArticleImagesFromHtml,
  formatArticleImagesForPrompt,
} from '@/utils/article-images-for-ai'
import { extractHtmlFromAiResponse, normalizeGeneratedHtml } from '@/utils/ai-html-response'
import { stripPreviewScripts } from '@/utils/parse-html'
import type { BlockMeasure, LayoutReport, PageMeasure } from '@/utils/texttopic/types'
import type { ChatTurnHistory } from '@/html-ai-assistant'
import templateHtml from '../../template/template.html?raw'

export {
  ARTICLE_HTML_GENERATION_SYSTEM_PROMPT,
  HTML_CHAT_SYSTEM_PROMPT,
  HTML_EDITOR_SYSTEM_PROMPT,
  LAYOUT_FIX_SYSTEM_PROMPT,
  MULTI_FILE_PATCH_PROTOCOL,
  PATCH_PROTOCOL,
} from '@/prompts'

// ── Patch 协议与应用 ──────────────────────────────────────────────

export const MAX_PATCH_RETRY = 2

function buildRetryBlock(previousError?: string, previousResponse?: string): string {
  if (!previousError) return ''
  return `

上一次响应未能成功应用。
失败原因：
${previousError}

上一次响应：
${previousResponse || '(无)'}

请基于当前文件重新输出可应用的 JSON。`
}

/** 构建单文件 patch 提示词 */
export function buildPatchPrompt(options: BuildPatchPromptOptions): string {
  const { fileName, content, request, previousError, previousResponse } = options
  const retryBlock = buildRetryBlock(previousError, previousResponse)

  return `${PATCH_PROTOCOL}${retryBlock}

用户需求：
${request}

当前文件：
路径：${fileName}
[[[文件开始]]]
${content}
[[[文件结束]]]

注意：[[[文件开始]]] 和 [[[文件结束]]] 只是标记，不是文件内容的一部分。`
}

/** 构建多文件 patch 提示词 */
export function buildMultiFilePatchPrompt(options: BuildMultiFilePatchPromptOptions): string {
  const { files, request, previousError, previousResponse } = options
  const retryBlock = buildRetryBlock(previousError, previousResponse)

  let filesContent = ''
  for (const file of files) {
    filesContent += `\n当前文件：\n路径：${file.filePath}\n[[[文件开始]]]\n${file.content}\n[[[文件结束]]]\n`
  }

  return `${MULTI_FILE_PATCH_PROTOCOL}${retryBlock}

用户需求：
${request}
${filesContent}
注意：[[[文件开始]]] 和 [[[文件结束]]] 只是标记，不是文件内容的一部分。`
}

/** 解析 AI 返回的 JSON patch 计划 */
export function parsePatchResponse(raw: string): EditPlan {
  const text = String(raw || '').trim()
  if (!text) throw new Error('AI 响应为空')

  const jsonText = stripCodeFence(text)
  let plan: unknown
  try {
    plan = JSON.parse(jsonText)
  } catch {
    throw new Error('AI 响应不是合法 JSON')
  }

  const obj = plan as Record<string, unknown>
  if (obj?.version !== 1) throw new Error('EditPlan version 必须是 1')
  if (!Array.isArray(obj.edits)) throw new Error('EditPlan edits 必须是数组')

  return {
    version: 1,
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    edits: obj.edits.map((edit, index) => normalizeEdit(edit, index)),
  }
}

/** 将 patch 计划应用到单文件内容 */
export function applyPatchPlan(options: ApplyPatchPlanOptions): ApplyPatchResult {
  const { content, fileName, plan } = options
  let nextContent = content
  const applied: string[] = []
  const editResults: ApplyPatchResult['editResults'] = []

  for (const edit of plan.edits) {
    if (edit.file && edit.file !== fileName) {
      throw new Error(`edit ${edit.id} 目标文件不匹配：${edit.file}`)
    }
    if (edit.action !== 'replace') {
      throw new Error(`edit ${edit.id} 使用了不支持的 action：${edit.action}`)
    }

    const match = resolveUniqueSearchMatch(nextContent, edit.search, edit.id)
    const replace = normalizeReplacementLineEndings(edit.replace, nextContent)
    nextContent = replaceRange(nextContent, match.start, match.end, replace)
    applied.push(edit.id)
    editResults.push({
      id: edit.id,
      searchLength: edit.search.length,
      replaceLength: edit.replace.length,
      delta: edit.replace.length - edit.search.length,
      matchMode: match.mode,
    })
  }

  return {
    content: nextContent,
    applied,
    editResults,
    changed: nextContent !== content,
    beforeLength: content.length,
    afterLength: nextContent.length,
  }
}

function normalizeEdit(edit: unknown, index: number): PatchEdit {
  const obj = edit as Record<string, unknown>
  const id =
    typeof obj?.id === 'string' && obj.id.trim() ? obj.id.trim() : `edit-${index + 1}`
  const action = (obj?.action as string) ?? 'replace'
  const search = obj?.search
  const replace = obj?.replace
  const content = obj?.content
  const file = obj?.file

  if (action !== 'replace' && action !== 'create') {
    throw new Error(`${id} action 必须是 replace 或 create`)
  }
  if (file !== undefined && typeof file !== 'string') {
    throw new Error(`${id} file 必须是字符串`)
  }

  if (action === 'create') {
    if (typeof content !== 'string') throw new Error(`${id} content 必须是字符串`)
    return { id, file, action: 'create', content } satisfies CreateEdit
  }

  if (typeof search !== 'string' || !search) {
    throw new Error(`${id} search 必须是非空字符串`)
  }
  if (typeof replace !== 'string') throw new Error(`${id} replace 必须是字符串`)

  return { id, file, action: 'replace', search, replace } satisfies ReplaceEdit
}

function stripCodeFence(text: string): string {
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match?.[1]?.trim() ?? text
}

function collectOccurrences(source: string, search: string): number[] {
  const indexes: number[] = []
  let index = 0

  while (index <= source.length) {
    const nextIndex = source.indexOf(search, index)
    if (nextIndex === -1) break
    indexes.push(nextIndex)
    index = nextIndex + search.length
  }

  return indexes
}

interface SearchMatch {
  start: number
  end: number
  mode: MatchMode
}

/** 定位唯一 search 锚点：精确 → trim → 换行归一化 */
function resolveUniqueSearchMatch(source: string, search: string, editId: string): SearchMatch {
  const exactIndexes = collectOccurrences(source, search)
  if (exactIndexes.length === 1) {
    const start = exactIndexes[0]!
    return {
      start,
      end: start + search.length,
      mode: 'exact',
    }
  }
  if (exactIndexes.length > 1) {
    throw new Error(
      `edit ${editId} 的 search 匹配到 ${exactIndexes.length} 次，请提供更长上下文`,
    )
  }

  const trimmedSearch = search.trim()
  if (trimmedSearch && trimmedSearch !== search) {
    const trimmedIndexes = collectOccurrences(source, trimmedSearch)
    if (trimmedIndexes.length === 1) {
      const start = trimmedIndexes[0]!
      return {
        start,
        end: start + trimmedSearch.length,
        mode: 'trimmed',
      }
    }
    if (trimmedIndexes.length > 1) {
      throw new Error(
        `edit ${editId} 的 search 去除首尾空白后匹配到 ${trimmedIndexes.length} 次，请提供更长上下文`,
      )
    }
  }

  const normalizedSource = normalizeLineEndingsWithMap(source)
  const normalizedSearch = normalizeLineEndings(search)
  if (normalizedSource.text !== source || normalizedSearch !== search) {
    const normalizedIndexes = collectOccurrences(normalizedSource.text, normalizedSearch)
    if (normalizedIndexes.length === 1) {
      const normStart = normalizedIndexes[0]!
      const start = normalizedSource.indexMap[normStart]!
      const endIndex = normStart + normalizedSearch.length
      const end =
        endIndex >= normalizedSource.indexMap.length
          ? source.length
          : normalizedSource.indexMap[endIndex]!
      return { start, end, mode: 'line-ending' }
    }
    if (normalizedIndexes.length > 1) {
      throw new Error(
        `edit ${editId} 的 search 换行归一化后匹配到 ${normalizedIndexes.length} 次，请提供更长上下文`,
      )
    }
  }

  throw new Error(`edit ${editId} 的 search 未匹配当前文件`)
}

function replaceRange(source: string, start: number, end: number, replacement: string): string {
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

function normalizeLineEndingsWithMap(text: string): { text: string; indexMap: number[] } {
  let normalized = ''
  const indexMap: number[] = []

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\r') {
      normalized += '\n'
      indexMap.push(i)
      if (text[i + 1] === '\n') i += 1
    } else {
      normalized += text[i]
      indexMap.push(i)
    }
  }

  return { text: normalized, indexMap }
}

function normalizeReplacementLineEndings(replacement: string, source: string): string {
  const lineEnding = detectLineEnding(source)
  if (lineEnding === '\n' || !replacement.includes('\n')) return replacement
  return normalizeLineEndings(replacement).replace(/\n/g, lineEnding)
}

function detectLineEnding(text: string): '\r\n' | '\n' {
  const crlfCount = (text.match(/\r\n/g) || []).length
  const lfCount = (text.match(/(?<!\r)\n/g) || []).length
  return crlfCount > lfCount ? '\r\n' : '\n'
}

// ── HTML 编辑核心 ────────────────────────────────────────────────

export interface EditHtmlOptions {
  provider?: AiProvider
  systemPrompt?: string
  maxRetry?: number
}

export interface EditHtmlInput {
  fileName: string
  content: string
  request: string
}

async function runPatchLoop(
  options: AiHtmlEditOptions & { provider: AiProvider },
): Promise<AiHtmlEditResult> {
  const { fileName, content, request, maxRetry = MAX_PATCH_RETRY, systemPrefix, provider } =
    options

  let currentContent = content
  let previousError: string | undefined
  let previousResponse: string | undefined
  let lastSummary = ''
  let lastApplied: string[] = []
  let lastEditResults: AiHtmlEditResult['editResults'] = []
  let lastRawResponse: string | undefined
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

    const raw = await provider.chat(prompt, {
      systemPrompt: systemPrefix,
    })

    previousResponse = raw
    lastRawResponse = raw

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
          rawResponse: raw,
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
        rawResponse: raw,
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
    rawResponse: lastRawResponse,
  }
}

/** 根据用户需求修改 HTML（提示词 → AI → JSON patch → 定位替换） */
export async function editHtmlWithAgent(
  input: EditHtmlInput,
  options: EditHtmlOptions = {},
): Promise<AiHtmlEditResult> {
  const provider = options.provider ?? getAiProvider()
  const systemPrompt = options.systemPrompt ?? HTML_EDITOR_SYSTEM_PROMPT
  const maxRetry = options.maxRetry ?? MAX_PATCH_RETRY

  if (!provider.isConfigured()) {
    throw new Error('AI 未配置，请先在 AI 助手填写 API 密钥')
  }

  return runPatchLoop({
    fileName: input.fileName,
    content: input.content,
    request: input.request,
    maxRetry,
    systemPrefix: systemPrompt,
    provider,
  })
}

// ── 业务：预览页对话改 HTML ──────────────────────────────────────

export function buildChatEditRequest(
  userMessage: string,
  report?: LayoutReport,
  history?: ChatTurnHistory[],
): string {
  const parts: string[] = []

  if (history?.length) {
    const historyText = history
      .map(
        (turn, index) =>
          `--- 第 ${index + 1} 轮 ---\n用户：${turn.userMessage}\nAI 响应（JSON）：\n${turn.assistantRawResponse}`,
      )
      .join('\n\n')
    parts.push(`【对话历史】\n${historyText}`)
  }

  parts.push(`【本轮用户需求】\n${userMessage.trim()}`)

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
          inlineStyle: b.inlineStyle || undefined,
          image: b.image,
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
  history?: ChatTurnHistory[]
}): Promise<AiHtmlEditResult> {
  if (!isAiReady()) {
    throw new Error('AI 未配置，请先在 AI 助手填写 API 密钥')
  }

  const request = buildChatEditRequest(options.userMessage, options.report, options.history)
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

// ── 业务：AI 布局优化 ────────────────────────────────────────────

function formatBlockLine(block: BlockMeasure): string {
  const parts = [
    block.dataId ?? '?',
    block.type,
    `y:${block.top}–${block.bottom}`,
  ]
  if (block.overflowsCanvas) parts.push(`超出 clip:${block.clipPx}`)
  if (block.textPreview) parts.push(`「${block.textPreview}」`)
  if (block.image) {
    const img = block.image
    if (img.assetId) parts.push(`asset:${img.assetId.slice(0, 8)}…`)
    if (img.naturalWidth && img.naturalHeight) {
      parts.push(`原图:${img.naturalWidth}×${img.naturalHeight}`)
    }
    if (img.hasImage) {
      parts.push(`渲染:${img.renderedWidth}×${img.renderedHeight}`)
    } else if (img.placeholder) {
      parts.push(`placeholder:${img.placeholder}`)
    }
  }
  if (block.inlineStyle) parts.push(`style:${block.inlineStyle}`)
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
    throw new Error('AI 未配置，请先在 AI 助手填写 API 密钥')
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

// ── 业务：文稿生成 HTML（完整文档，非 patch）────────────────────────

const ARTICLE_HTML_GENERATION_MAX_RETRY = 1

type ArticleForHtmlGen = Pick<Article, 'title' | 'cover' | 'body' | 'notes'>

export function buildArticleHtmlGenerationPrompt(article: ArticleForHtmlGen): string {
  const joinedHtml = [article.cover, article.body, article.notes].filter(Boolean).join('\n')
  const images = extractArticleImagesFromHtml(joinedHtml)
  const imageSection = formatArticleImagesForPrompt(images)
  const template = stripPreviewScripts(templateHtml)

  return `请根据下方文稿，参考模板的分页骨架（.page-wrap / .page），生成一份**完整 HTML 文件**。
用文稿内容填满 #doc；可按需要设计 head/style 与页内结构。

文稿标题：${article.title}

【封面区】（第 1 页封面）
${article.cover || '（空）'}

【正文区】（正文页，按顺序排版）
${article.body || '（空）'}

【备注区】（配色、结构、分页等全局约束，一般不直接成文）
${article.notes || '（空）'}

${imageSection}

生成要求：
1. 输出完整 HTML 文档
2. 第 1 页 page--cover，正文从第 2 页起，每页 1080×1440，过多则新开 .page
3. 页内用语义标签与自定义 class；主要单元带 data-id
4. 配图放入内容单元，保留 data-asset-id / data-width / data-height，不要写 src/base64
5. 按图片尺寸规划宽度与分页
6. 参考下列模板的骨架与预览缩放

【参考模板 HTML】
${template}`
}

export async function generateHtmlFromArticle(
  article: ArticleForHtmlGen,
): Promise<AiHtmlEditResult> {
  if (!isAiReady()) {
    throw new Error('AI 未配置，请先在 AI 助手填写 API 密钥')
  }

  const provider = getAiProvider()
  const basePrompt = buildArticleHtmlGenerationPrompt(article)
  let previousError: string | undefined
  let attempts = 0
  const maxAttempts = ARTICLE_HTML_GENERATION_MAX_RETRY + 1

  while (attempts < maxAttempts) {
    attempts += 1

    const request =
      basePrompt +
      (previousError
        ? `\n\n【上次输出无效】${previousError}\n请重新输出完整 HTML 文档（<!DOCTYPE html> … </html>），不要解释。`
        : '')

    const raw = await provider.chat(request, {
      systemPrompt: ARTICLE_HTML_GENERATION_SYSTEM_PROMPT,
    })

    try {
      const content = normalizeGeneratedHtml(extractHtmlFromAiResponse(raw))

      return {
        content,
        summary: '已根据文稿生成完整 HTML',
        applied: [],
        editResults: [],
        changed: true,
        attempts,
      }
    } catch (error) {
      previousError = error instanceof Error ? error.message : String(error)
      if (attempts >= maxAttempts) {
        throw new Error(`生成 HTML 失败（已重试 ${ARTICLE_HTML_GENERATION_MAX_RETRY} 次）：${previousError}`)
      }
    }
  }

  throw new Error('生成 HTML 失败')
}
