/** AI 返回的 patch 计划 */
export interface EditPlan {
  version: 1
  summary: string
  edits: PatchEdit[]
}

export interface ReplaceEdit {
  id: string
  file?: string
  action: 'replace'
  search: string
  replace: string
}

export interface CreateEdit {
  id: string
  file?: string
  action: 'create'
  content: string
}

export type PatchEdit = ReplaceEdit | CreateEdit

export type MatchMode = 'exact' | 'trimmed' | 'line-ending'

export interface EditResult {
  id: string
  searchLength: number
  replaceLength: number
  delta: number
  matchMode: MatchMode
}

/** 单文件 patch 应用结果 */
export interface ApplyPatchResult {
  content: string
  applied: string[]
  editResults: EditResult[]
  changed: boolean
  beforeLength: number
  afterLength: number
}

export interface BuildPatchPromptOptions {
  fileName: string
  content: string
  request: string
  previousError?: string
  previousResponse?: string
}

export interface MultiFileInput {
  filePath: string
  content: string
}

export interface BuildMultiFilePatchPromptOptions {
  files: MultiFileInput[]
  request: string
  previousError?: string
  previousResponse?: string
}

export interface ApplyPatchPlanOptions {
  content: string
  fileName: string
  plan: EditPlan
}

export interface AiHtmlEditOptions {
  fileName: string
  content: string
  request: string
  /** 失败时最多重试次数，默认 2 */
  maxRetry?: number
  /** 可选：自定义 system prompt 前缀（如项目背景约束） */
  systemPrefix?: string
}

export interface AiHtmlEditResult {
  content: string
  summary: string
  applied: string[]
  editResults: EditResult[]
  changed: boolean
  attempts: number
}
