import { restoreAssetRefsInHtml } from '@/utils/article-asset-html'

/** 判断是否为 TipTap / HTML 富文本内容 */
export function isRichHtmlContent(content: string): boolean {
  const trimmed = content.trim()
  if (!trimmed) return false
  return /^<[a-z][\s\S]*>/i.test(trimmed)
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 旧版纯文本文稿 → TipTap 可加载的 HTML */
export function plainTextToRichHtml(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''

  return trimmed
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split('\n').map((line) => escapeHtml(line)).join('<br>')
      return `<p>${lines}</p>`
    })
    .join('')
}

/** 加载到编辑器前统一规范化 */
export function normalizeArticleContent(content: string): string {
  if (!content.trim()) return ''
  let html = isRichHtmlContent(content) ? content : plainTextToRichHtml(content)
  // 清理历史坏数据：图片前残留的 "!alt" 文本节点
  html = html.replace(/!([^<]+)<img(\s[^>]*\balt="\1"[^>]*)>/gi, '<img$2>')
  return html
}

/** 保存时去掉空文档占位，并把 blob URL 还原为 asset:// 引用 */
export function serializeArticleContent(html: string): string {
  const trimmed = html.trim()
  if (!trimmed || trimmed === '<p></p>') return ''
  return restoreAssetRefsInHtml(html)
}
