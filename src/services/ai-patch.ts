import type {
  ApplyPatchPlanOptions,
  ApplyPatchResult,
  BuildMultiFilePatchPromptOptions,
  BuildPatchPromptOptions,
  CreateEdit,
  EditPlan,
  MatchMode,
  PatchEdit,
  ReplaceEdit,
} from '@/types/ai-patch'

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
