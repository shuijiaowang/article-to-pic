/**
 * 从根目录 prompts/ 加载并拼装 AI 提示词。
 * 文案请改 prompts/*.md，勿在此写长提示词。
 */
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
  return [trimPrompt(body), PAGE_STRUCTURE_RULES_TEXT, STYLE_HINT_TEXT, IMG_BLOCK_RULES_TEXT].join(
    '\n\n',
  )
}

export const PAGE_STRUCTURE_RULES_TEXT = trimPrompt(pageStructure)
export const STYLE_HINT_TEXT = trimPrompt(styleHint)
export const IMG_BLOCK_RULES_TEXT = trimPrompt(imgBlock)

export const PATCH_PROTOCOL = trimPrompt(patchProtocolRaw)
export const MULTI_FILE_PATCH_PROTOCOL = trimPrompt(multiFilePatchProtocolRaw)

export const HTML_EDITOR_SYSTEM_PROMPT = withSharedRules(htmlEditorSystemRaw)

export const HTML_CHAT_SYSTEM_PROMPT = `${HTML_EDITOR_SYSTEM_PROMPT}

${trimPrompt(htmlChatExtraRaw)}`

export const LAYOUT_FIX_SYSTEM_PROMPT = withSharedRules(layoutFixSystemRaw)

export const ARTICLE_HTML_GENERATION_SYSTEM_PROMPT = withSharedRules(articleHtmlGenerationSystemRaw)
