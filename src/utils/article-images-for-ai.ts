import { parseAssetId } from '@/utils/asset-url'

export interface ArticleImageRef {
  assetId: string
  alt: string
  width: number | null
  height: number | null
  aspectRatio: number | null
}

function parseDimension(value: string | null | undefined): number | null {
  if (!value) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** 从 TipTap 文稿 HTML 中提取配图引用（不含二进制） */
export function extractArticleImagesFromHtml(html: string): ArticleImageRef[] {
  if (!html.trim()) return []

  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const images: ArticleImageRef[] = []
  const seen = new Set<string>()

  doc.querySelectorAll('#root img').forEach((img) => {
    const assetId = img.getAttribute('data-asset-id') ?? parseAssetId(img.getAttribute('src'))
    if (!assetId || seen.has(assetId)) return
    seen.add(assetId)

    const width = parseDimension(img.getAttribute('data-width'))
    const height = parseDimension(img.getAttribute('data-height'))

    images.push({
      assetId,
      alt: img.getAttribute('alt')?.trim() || '',
      width,
      height,
      aspectRatio: width && height ? +(width / height).toFixed(3) : null,
    })
  })

  return images
}

/** 拼进生成 HTML 的 user prompt */
export function formatArticleImagesForPrompt(images: ArticleImageRef[]): string {
  if (images.length === 0) {
    return '【文稿配图】正文中无图片。若排版需要可不加配图单元。'
  }

  const lines = images.map((img, index) => {
    const size =
      img.width && img.height ? `${img.width}×${img.height}px` : '尺寸未知（请保留文稿中的 data-width/height）'
    const ratio = img.aspectRatio
      ? img.aspectRatio >= 1
        ? `横图，宽高比 ${img.aspectRatio}`
        : `竖图，宽高比 ${img.aspectRatio}`
      : ''
    const alt = img.alt ? `，说明「${img.alt}」` : ''
    return `${index + 1}. data-asset-id="${img.assetId}" | ${size}${ratio ? ` | ${ratio}` : ''}${alt}`
  })

  return `【文稿配图清单】每张图放入某页内容单元（建议带 data-id），保留 data-asset-id / data-width / data-height，不要写 src：
${lines.join('\n')}`
}
