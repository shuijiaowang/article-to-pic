/**
 * AI HTML 编辑 — patch 协议、编辑核心、三个业务场景（对话 / 布局优化 / 文稿生成）
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
import { stripPreviewScripts } from '@/utils/parse-html'
import type { BlockMeasure, LayoutReport, PageMeasure } from '@/utils/texttopic/types'
import templateHtml from '../../template/template.html?raw'

// ── Patch 协议与应用 ──────────────────────────────────────────────

/** 单文件 HTML patch 协议 — 约束 AI 只返回 JSON search/replace */
export const PATCH_PROTOCOL = `你是一个严格的文本 patch 生成器。

只返回 JSON，不要 markdown，不要解释，不要代码块。
不要返回完整文件内容。
只能修改用户提供的文件。

返回格式必须是：
{
  "version": 1,
  "summary": "一句话说明本次修改",
  "edits": [
    {
      "id": "edit-1",
      "file": "文件名",
      "action": "replace",
      "search": "必须逐字存在于当前文件中的原始文本",
      "replace": "替换后的文本"
    }
  ]
}

规则：
1. 目前只允许 action=replace。
2. 删除内容时，replace 传空字符串。
3. search 必须从"当前文件"里逐字复制，不能自己补空格、换行或缩进。
4. search 必须唯一匹配。通常复制目标位置前后 3-8 行原文，不要只给 "</head>"、"</body>"、"<div>" 这类很短片段。
5. 插入内容时，把 search 写成插入位置附近的一整段原文锚点，replace 写成"同一段原文锚点 + 新内容"。
6. 如果要在 </head> 前插入样式，不要把 search 写成 "</head>"；应复制 <title> 到 </head> 这一段，例如：
   "search": "  <title>Document</title>\\n</head>",
   "replace": "  <title>Document</title>\\n<style>...新增样式...</style>\\n</head>"
7. 输出前自检：每个 search 都必须能在当前文件内容里直接找到，且只能找到 1 次。
8. **重要**：search 和 replace 中绝对不能包含"[[[文件开始]]]"或"[[[文件结束]]]"这些标记，它们只是用来标注文件边界的，不是文件内容的一部分。
9. 如果无法修改，返回 {"version":1,"summary":"无法修改原因","edits":[]}。`

/** 多文件 patch 协议（支持 replace + create） */
export const MULTI_FILE_PATCH_PROTOCOL = `你是一个严格的多文件 patch 生成器。

只返回 JSON，不要 markdown，不要解释，不要代码块。
修改已有文件时不要返回完整文件内容；创建新文件时必须返回完整文件内容。

返回格式必须是：
{
  "version": 1,
  "summary": "一句话说明本次修改",
  "edits": [
    {
      "id": "edit-1",
      "file": "文件的完整路径（必须与提供的文件路径完全一致）",
      "action": "replace",
      "search": "必须逐字存在于该文件中的原始文本",
      "replace": "替换后的文本"
    },
    {
      "id": "edit-2",
      "file": "要创建的新文件路径",
      "action": "create",
      "content": "新文件的完整内容"
    }
  ]
}

规则：
1. action 只允许 replace 或 create。
2. replace 用于修改已有文件，file 字段必须与下方提供的某个文件路径完全一致。
3. create 只用于确实需要新建文件的情况；非必要不要新建文件，优先修改已有文件。
4. create 的 file 是新文件路径，content 是完整文件内容；不要给 create 写 search/replace。
5. 删除已有文件里的部分内容时，replace 传空字符串。
6. replace 的 search 必须从对应文件里逐字复制，不能自己补空格、换行或缩进。
7. replace 的 search 必须在对应文件中唯一匹配。复制目标位置前后 3-8 行原文，不要只给很短的片段。
8. 插入内容时，把 search 写成插入位置附近的一整段原文锚点，replace 写成"同一段原文锚点 + 新内容"。
9. 输出前自检：每个 replace 的 search 都必须在对应文件内容里直接找到，且只能找到 1 次。
10. **重要**：search、replace 和 content 中绝对不能包含"[[[文件开始]]]"或"[[[文件结束]]]"这些标记。
11. 如果无法修改，返回 {"version":1,"summary":"无法修改原因","edits":[]}。`

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

/** TextToPic 模板 HTML 编辑约束 — system prompt 基础 */
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

/** 根据用户需求修改 HTML（提示词 → AI → JSON patch → 定位替换） */
export async function editHtmlWithAgent(
  input: EditHtmlInput,
  options: EditHtmlOptions = {},
): Promise<AiHtmlEditResult> {
  const provider = options.provider ?? getAiProvider()
  const systemPrompt = options.systemPrompt ?? HTML_EDITOR_SYSTEM_PROMPT
  const maxRetry = options.maxRetry ?? MAX_PATCH_RETRY

  if (!provider.isConfigured()) {
    throw new Error('AI 未配置，请先在设置页填写 API 密钥')
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

// ── 业务：AI 布局优化 ────────────────────────────────────────────

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

// ── 业务：文稿生成 HTML ──────────────────────────────────────────

export function buildArticleHtmlRequest(article: Pick<Article, 'title' | 'content'>): string {
  return `请根据以下文稿，将当前 HTML 文件中 #doc 内的示例页面全部替换为根据文稿排版生成的新内容。

文稿标题：${article.title}

文稿正文：
${article.content}

要求：
1. 只修改 #doc 内的 .page-wrap / .page / .block，不要改 head、style、.toolbar、script
2. 第 1 页为封面 page--cover，正文从第 2 页开始
3. 每页画布 1080×1440px，内容过多时新开 .page
4. 每个 block 需 data-id，img 块只写 data-placeholder 不要 src
5. 封面可自由搭配 style，正文块遵循模板默认样式`
}

export async function generateHtmlFromArticle(
  article: Pick<Article, 'title' | 'content'>,
): Promise<AiHtmlEditResult> {
  if (!isAiReady()) {
    throw new Error('AI 未配置，请先在设置页填写 API 密钥')
  }

  const content = stripPreviewScripts(templateHtml)
  const request = buildArticleHtmlRequest(article)

  const result = await editHtmlWithAgent({
    fileName: 'template.html',
    content,
    request,
  })

  return {
    ...result,
    content: stripPreviewScripts(result.content),
  }
}
