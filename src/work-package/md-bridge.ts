import { toAssetUrl, parseAssetId } from '@/utils/asset-url'
import { htmlToMarkdown, markdownToHtml } from '@/utils/article-md'
import type { ArticleInput } from '@/types/document'
import type { WorkPackageManifest } from '@/work-package/types'
import { findAssetIdByPath } from '@/work-package/manifest'
import { parseRelativeAssetPath, toRelativeAssetPath } from '@/work-package/paths'

/** TipTap HTML → 工作包 Markdown（asset:// → ./assets/xxx） */
export function htmlToWorkPackageMarkdown(
  html: string,
  pathByAssetId: Map<string, string>,
): string {
  const trimmed = html.trim()
  if (!trimmed) return ''

  let md = htmlToMarkdown(trimmed)
  for (const [id, path] of pathByAssetId) {
    md = md.replaceAll(`asset://${id}`, toRelativeAssetPath(path))
  }
  return md
}

/**
 * 工作包 Markdown → TipTap HTML。
 * 先把 ./assets/xxx（及遗留 asset://）统一成 asset:// markdown，再走 markdownToHtml，
 * 避免先插入 <img> HTML 被 escape 成纯文本。
 */
export function workPackageMarkdownToHtml(
  md: string,
  manifest: WorkPackageManifest,
  pendingPaths = new Map<string, string>(),
): string {
  const rewritten = md.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (full, alt, src, title) => {
      const rawSrc = String(src)
      const relPath = parseRelativeAssetPath(rawSrc)
      let assetId: string | null = null

      if (relPath) {
        assetId = findAssetIdByPath(manifest, relPath) ?? pendingPaths.get(relPath) ?? null
        if (!assetId) {
          assetId = crypto.randomUUID()
          pendingPaths.set(relPath, assetId)
        }
      } else {
        assetId = parseAssetId(rawSrc)
      }

      if (!assetId) return full

      const titlePart = title ? ` "${title}"` : ''
      return `![${alt}](${toAssetUrl(assetId)}${titlePart})`
    },
  )

  return markdownToHtml(rewritten)
}

export function articleToWorkPackageMarkdown(
  article: ArticleInput,
  pathByAssetId: Map<string, string>,
): string {
  const title = article.title.trim() || '未命名文稿'
  return [
    `# ${title}`,
    '',
    '## 封面区',
    '',
    htmlToWorkPackageMarkdown(article.cover, pathByAssetId) || '',
    '',
    '## 正文区',
    '',
    htmlToWorkPackageMarkdown(article.body, pathByAssetId) || '',
    '',
    '## 备注区',
    '',
    htmlToWorkPackageMarkdown(article.notes, pathByAssetId) || '',
    '',
  ].join('\n')
}

export function workPackageMarkdownToArticle(
  md: string,
  manifest: WorkPackageManifest,
  pendingPaths = new Map<string, string>(),
): ArticleInput {
  const text = md.replace(/^\uFEFF/, '').trim()
  if (!text) {
    throw new Error('文稿.md 为空')
  }

  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let title = '未命名文稿'
  for (const line of lines) {
    if (/^##\s*(封面区|正文区|备注区)\s*$/.test(line)) break
    const m = /^#\s+(.+)$/.exec(line)
    if (m?.[1]?.trim()) {
      title = m[1].trim()
      break
    }
  }

  const sections = extractSections(text)
  return {
    title,
    cover: workPackageMarkdownToHtml(sections.cover, manifest, pendingPaths),
    body: workPackageMarkdownToHtml(sections.body, manifest, pendingPaths),
    notes: workPackageMarkdownToHtml(sections.notes, manifest, pendingPaths),
  }
}

function extractSections(md: string): { cover: string; body: string; notes: string } {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const buckets: Record<string, string[]> = {
    封面区: [],
    正文区: [],
    备注区: [],
  }
  let current: string | null = null

  for (const line of lines) {
    const m = /^##\s*(封面区|正文区|备注区)\s*$/.exec(line.replace(/\r$/, ''))
    if (m?.[1]) {
      current = m[1]
      continue
    }
    if (current) buckets[current]!.push(line)
  }

  return {
    cover: buckets['封面区']!.join('\n').trim(),
    body: buckets['正文区']!.join('\n').trim(),
    notes: buckets['备注区']!.join('\n').trim(),
  }
}
