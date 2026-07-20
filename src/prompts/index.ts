/**
 * 从根目录 prompts/ 加载并拼装 AI 提示词。
 * 文案请改 prompts/*.md，勿在此写长提示词。
 * 画布尺寸占位符 {{PAGE_W}} / {{PAGE_H}} / {{CANVAS_LABEL}} 由 applyPageSizePlaceholders 填充。
 */
import { applyPageSizePlaceholders } from '@/utils/page-size'
import pageStructure from '../../prompts/shared/page-structure.md?raw'
import styleHint from '../../prompts/shared/style-hint.md?raw'
import imgBlock from '../../prompts/shared/img-block.md?raw'
import patchProtocolRaw from '../../prompts/patch-protocol.md?raw'
import multiFilePatchProtocolRaw from '../../prompts/multi-file-patch-protocol.md?raw'
import htmlEditorSystemRaw from '../../prompts/html-editor-system.md?raw'
import htmlChatExtraRaw from '../../prompts/html-chat-extra.md?raw'
import layoutFixSystemRaw from '../../prompts/layout-fix-system.md?raw'
import articleHtmlGenerationSystemRaw from '../../prompts/article-html-generation-system.md?raw'

function trimPrompt(text: string): string {
  return text.replace(/^\uFEFF/, '').trim()
}

function withSharedRules(body: string): string {
  return [
    trimPrompt(body),
    getPageStructureRulesText(),
    getStyleHintText(),
    getImgBlockRulesText(),
  ].join('\n\n')
}

export function getPageStructureRulesText(): string {
  return applyPageSizePlaceholders(trimPrompt(pageStructure))
}

export function getStyleHintText(): string {
  return trimPrompt(styleHint)
}

export function getImgBlockRulesText(): string {
  return trimPrompt(imgBlock)
}

export function getPatchProtocol(): string {
  return trimPrompt(patchProtocolRaw)
}

export function getMultiFilePatchProtocol(): string {
  return trimPrompt(multiFilePatchProtocolRaw)
}

export function getHtmlEditorSystemPrompt(): string {
  return withSharedRules(htmlEditorSystemRaw)
}

export function getHtmlChatSystemPrompt(): string {
  return `${getHtmlEditorSystemPrompt()}

${applyPageSizePlaceholders(trimPrompt(htmlChatExtraRaw))}`
}

export function getLayoutFixSystemPrompt(): string {
  return withSharedRules(layoutFixSystemRaw)
}

export function getArticleHtmlGenerationSystemPrompt(): string {
  return withSharedRules(articleHtmlGenerationSystemRaw)
}

export const PATCH_PROTOCOL = trimPrompt(patchProtocolRaw)
export const MULTI_FILE_PATCH_PROTOCOL = trimPrompt(multiFilePatchProtocolRaw)
