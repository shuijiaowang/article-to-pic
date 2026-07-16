import { isRichHtmlContent, plainTextToRichHtml } from '@/utils/article-content'
import type { ArticleInput } from '@/types/document'

const SECTION_COVER = '封面区'
const SECTION_BODY = '正文区'
const SECTION_NOTES = '备注区'

/** 旧版「复制导出」追加说明的起止标记；粘贴导入时仍会剥离 */
export const ARTICLE_MD_PROMPT_START = '<!-- ARTICLE_TO_PIC_PROMPT_START -->'
export const ARTICLE_MD_PROMPT_END = '<!-- ARTICLE_TO_PIC_PROMPT_END -->'

export type ArticleMarkdown = ArticleInput

/** 去掉旧版导出时追加的格式说明块（现已改用 SKILL.md，导出不再追加） */
export function stripArticleMdExportFooter(md: string): string {
  const start = md.indexOf(ARTICLE_MD_PROMPT_START)
  if (start === -1) return md

  const end = md.indexOf(ARTICLE_MD_PROMPT_END, start)
  const afterEnd =
    end === -1 ? md.length : end + ARTICLE_MD_PROMPT_END.length

  let before = md.slice(0, start)
  // 一并去掉说明块紧前的分隔线 ---
  before = before.replace(/\n---\s*$/, '').replace(/^---\s*$/, '')

  return `${before}${md.slice(afterEnd)}`.replace(/\n{3,}/g, '\n\n').trim()
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function decodeHtmlEntities(text: string): string {
  const el = document.createElement('textarea')
  el.innerHTML = text
  return el.value
}

function inlineToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/([\\`*_[\]#])/g, '\\$1')
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  const inner = Array.from(el.childNodes).map(inlineToMd).join('')

  switch (tag) {
    case 'strong':
    case 'b':
      return `**${inner}**`
    case 'em':
    case 'i':
      return `*${inner}*`
    case 'mark':
      return `==${inner}==`
    case 'code':
      return `\`${el.textContent ?? ''}\``
    case 'br':
      return '  \n'
    case 'a': {
      const href = el.getAttribute('href') || ''
      return href ? `[${inner}](${href})` : inner
    }
    default:
      return inner
  }
}

function listToMd(el: HTMLElement, ordered: boolean, depth = 0): string {
  const indent = '  '.repeat(depth)
  const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li')
  return items
    .map((li, i) => {
      const prefix = ordered ? `${i + 1}. ` : '- '
      const parts: string[] = []
      let inline = ''
      for (const child of Array.from(li.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const childEl = child as HTMLElement
          const t = childEl.tagName.toLowerCase()
          if (t === 'ul' || t === 'ol') {
            if (inline.trim()) {
              parts.push(`${indent}${prefix}${inline.trim()}`)
              inline = ''
            }
            parts.push(listToMd(childEl, t === 'ol', depth + 1))
            continue
          }
        }
        inline += inlineToMd(child)
      }
      if (inline.trim() || parts.length === 0) {
        parts.unshift(`${indent}${prefix}${inline.trim()}`)
      }
      return parts.join('\n')
    })
    .join('\n')
}

function imgToMd(el: HTMLElement): string {
  const alt = el.getAttribute('alt') || ''
  const assetId = el.getAttribute('data-asset-id')
  const width = el.getAttribute('data-width')
  const height = el.getAttribute('data-height')
  const src = assetId
    ? `asset://${assetId}`
    : el.getAttribute('src') || ''
  if (!src) return ''

  const attrs: string[] = []
  if (width) attrs.push(`width=${width}`)
  if (height) attrs.push(`height=${height}`)
  const title = attrs.length ? ` "${attrs.join(' ')}"` : ''
  return `![${alt}](${src}${title})`
}

function blockToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? '').trim()
    return text ? text : ''
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()

  switch (tag) {
    case 'h1':
      return `# ${Array.from(el.childNodes).map(inlineToMd).join('').trim()}`
    case 'h2':
      return `## ${Array.from(el.childNodes).map(inlineToMd).join('').trim()}`
    case 'h3':
      return `### ${Array.from(el.childNodes).map(inlineToMd).join('').trim()}`
    case 'p':
      return Array.from(el.childNodes).map(inlineToMd).join('').trim()
    case 'blockquote': {
      const inner = Array.from(el.childNodes)
        .map(blockToMd)
        .filter(Boolean)
        .join('\n\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
      return inner
    }
    case 'ul':
      return listToMd(el, false)
    case 'ol':
      return listToMd(el, true)
    case 'img':
      return imgToMd(el)
    case 'pre':
      return `\`\`\`\n${el.textContent ?? ''}\n\`\`\``
    case 'hr':
      return '---'
    case 'div':
    case 'span':
      return Array.from(el.childNodes).map(blockToMd).filter(Boolean).join('\n\n')
    default:
      return Array.from(el.childNodes).map(inlineToMd).join('').trim()
  }
}

/** TipTap HTML → Markdown */
export function htmlToMarkdown(html: string): string {
  const trimmed = html.trim()
  if (!trimmed) return ''
  if (!isRichHtmlContent(trimmed)) return trimmed

  const doc = new DOMParser().parseFromString(`<div id="__root">${trimmed}</div>`, 'text/html')
  const root = doc.getElementById('__root')
  if (!root) return trimmed

  return Array.from(root.childNodes)
    .map(blockToMd)
    .filter((s) => s.trim())
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseInlineMd(text: string): string {
  let s = escapeHtml(text)
  // images first
  s = s.replace(
    /!\[([^\]]*)\]\((asset:\/\/[^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_m, alt, src, title) => {
      const assetId = String(src).replace(/^asset:\/\//, '')
      let width = ''
      let height = ''
      if (title) {
        const w = /width=(\d+)/.exec(title)
        const h = /height=(\d+)/.exec(title)
        if (w?.[1]) width = w[1]
        if (h?.[1]) height = h[1]
      }
      const attrs = [
        `src="${escapeHtml(src)}"`,
        `alt="${escapeHtml(alt)}"`,
        `data-asset-id="${escapeHtml(assetId)}"`,
      ]
      if (width) attrs.push(`data-width="${width}"`)
      if (height) attrs.push(`data-height="${height}"`)
      return `<img ${attrs.join(' ')}>`
    },
  )
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_m, alt, src) => {
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`
  })
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  s = s.replace(/==(.+?)==/g, '<mark>$1</mark>')
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\\([\\`*_[\]#])/g, '$1')
  s = s.replace(/  \n/g, '<br>')
  return s
}

function isListLine(line: string) {
  return /^(\s*)([-*+]|\d+\.)\s+/.test(line)
}

function parseListBlock(lines: string[], start: number): { html: string; next: number } {
  const items: { ordered: boolean; text: string }[] = []
  let i = start
  let ordered = false
  while (i < lines.length && isListLine(lines[i]!)) {
    const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i]!)
    if (!m) break
    ordered = /^\d+\./.test(m[2]!)
    items.push({ ordered, text: m[3] ?? '' })
    i++
  }
  const tag = ordered ? 'ol' : 'ul'
  const html = `<${tag}>${items.map((it) => `<li><p>${parseInlineMd(it.text)}</p></li>`).join('')}</${tag}>`
  return { html, next: i }
}

/** Markdown → TipTap HTML */
export function markdownToHtml(md: string): string {
  const trimmed = md.trim()
  if (!trimmed) return ''
  if (isRichHtmlContent(trimmed)) return trimmed

  const lines = trimmed.replace(/\r\n/g, '\n').split('\n')
  const blocks: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (!line.trim()) {
      i++
      continue
    }

    if (/^```/.test(line)) {
      i++
      const code: string[] = []
      while (i < lines.length && !/^```/.test(lines[i] ?? '')) {
        code.push(lines[i]!)
        i++
      }
      if (i < lines.length) i++
      blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    if (/^---+$/.test(line.trim())) {
      blocks.push('<hr>')
      i++
      continue
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1]!.length
      blocks.push(`<h${level}>${parseInlineMd(heading[2] ?? '')}</h${level}>`)
      i++
      continue
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i] ?? '')) {
        quote.push((lines[i] ?? '').replace(/^>\s?/, ''))
        i++
      }
      const inner = markdownToHtml(quote.join('\n'))
      blocks.push(`<blockquote>${inner || `<p>${parseInlineMd(quote.join(' '))}</p>`}</blockquote>`)
      continue
    }

    if (isListLine(line)) {
      const { html, next } = parseListBlock(lines, i)
      blocks.push(html)
      i = next
      continue
    }

    // paragraph: consume until blank
    const para: string[] = [line]
    i++
    while (i < lines.length) {
      const next = lines[i] ?? ''
      if (!next.trim()) break
      if (/^(#{1,3})\s+/.test(next) || /^>\s?/.test(next) || isListLine(next) || /^```/.test(next) || /^---+$/.test(next.trim())) {
        break
      }
      para.push(next)
      i++
    }
    blocks.push(`<p>${parseInlineMd(para.join('  \n'))}</p>`)
  }

  return blocks.join('') || plainTextToRichHtml(trimmed)
}

/** 文稿 → 可复制的 Markdown（纯三区内容；格式说明见 SKILL.md） */
export function articleToMarkdown(article: ArticleMarkdown): string {
  const title = article.title.trim() || '未命名文稿'
  return [
    `# ${title}`,
    '',
    `## ${SECTION_COVER}`,
    '',
    htmlToMarkdown(article.cover) || '',
    '',
    `## ${SECTION_BODY}`,
    '',
    htmlToMarkdown(article.body) || '',
    '',
    `## ${SECTION_NOTES}`,
    '',
    htmlToMarkdown(article.notes) || '',
    '',
  ].join('\n')
}

function extractTitle(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  for (const line of lines) {
    if (isSectionHeading(line)) break
    const m = /^#\s+(.+)$/.exec(line)
    if (m?.[1]?.trim()) return decodeHtmlEntities(m[1].trim())
  }
  return '未命名文稿'
}

function isSectionHeading(line: string): string | null {
  const m = /^##\s*(封面区|正文区|备注区)\s*$/.exec(line.replace(/\r$/, ''))
  return m?.[1] ?? null
}

/** 按行切三区，避免 m 模式下 `$` 误匹配行尾导致内容为空 */
function extractSections(md: string): { cover: string; body: string; notes: string } {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const buckets: Record<string, string[]> = {
    [SECTION_COVER]: [],
    [SECTION_BODY]: [],
    [SECTION_NOTES]: [],
  }
  let current: string | null = null

  for (const line of lines) {
    const section = isSectionHeading(line)
    if (section) {
      current = section
      continue
    }
    if (current) buckets[current]!.push(line)
  }

  return {
    cover: buckets[SECTION_COVER]!.join('\n').trim(),
    body: buckets[SECTION_BODY]!.join('\n').trim(),
    notes: buckets[SECTION_NOTES]!.join('\n').trim(),
  }
}

/** Markdown → 文稿三区；兼容无分区的整篇正文 */
export function markdownToArticle(md: string): ArticleMarkdown {
  const text = stripArticleMdExportFooter(md.replace(/^\uFEFF/, '')).trim()
  if (!text) {
    throw new Error('剪贴板为空')
  }

  const hasSections = /^##\s*(封面区|正文区|备注区)\s*$/m.test(text)

  if (!hasSections) {
    return {
      title: extractTitle(text),
      cover: '',
      body: markdownToHtml(text.replace(/^#\s+.+$/m, '').trim()),
      notes: '',
    }
  }

  const sections = extractSections(text)
  return {
    title: extractTitle(text),
    cover: markdownToHtml(sections.cover),
    body: markdownToHtml(sections.body),
    notes: markdownToHtml(sections.notes),
  }
}
