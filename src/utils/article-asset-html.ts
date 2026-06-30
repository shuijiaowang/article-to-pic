import { getAssetBlobUrl } from '@/storage/article-assets'
import { parseAssetId, toAssetUrl } from '@/utils/asset-url'

function removePlaceholderHintForImg(img: HTMLImageElement) {
  img.closest('.block.img')?.querySelector('.placeholder-hint')?.remove()
}

async function resolveImgElement(img: HTMLImageElement): Promise<boolean> {
  const assetId = img.getAttribute('data-asset-id') ?? parseAssetId(img.getAttribute('src'))
  if (!assetId) return false

  const src = img.getAttribute('src')
  if (src?.startsWith('blob:') || src?.startsWith('data:')) return false

  const blobUrl = await getAssetBlobUrl(assetId)
  if (!blobUrl) return false

  img.setAttribute('data-asset-id', assetId)
  img.setAttribute('src', blobUrl)

  if (!img.getAttribute('data-width') && img.getAttribute('width')) {
    img.setAttribute('data-width', img.getAttribute('width')!)
  }
  if (!img.getAttribute('data-height') && img.getAttribute('height')) {
    img.setAttribute('data-height', img.getAttribute('height')!)
  }

  removePlaceholderHintForImg(img)
  return true
}

function wrapHtml(html: string): { root: HTMLElement; cleanup: () => void } {
  const host = document.createElement('div')
  host.innerHTML = html
  return {
    root: host,
    cleanup: () => {
      host.remove()
    },
  }
}

/** 持久化 HTML（asset://）→ 编辑器展示（blob URL） */
export async function resolveAssetsInHtml(html: string): Promise<string> {
  if (!html.trim()) return html
  if (!html.includes('asset://') && !html.includes('data-asset-id')) return html

  const { root, cleanup } = wrapHtml(html)

  try {
    const imgs = [...root.querySelectorAll('img')]
    await Promise.all(imgs.map((img) => resolveImgElement(img)))
    return root.innerHTML
  } finally {
    cleanup()
  }
}

/** 实时 DOM 中的 data-asset-id → blob URL（预览 / 可视化编辑展示用） */
export async function resolveAssetsInDoc(doc: HTMLElement): Promise<number> {
  const imgs = [...doc.querySelectorAll('img')]
  const results = await Promise.all(imgs.map((img) => resolveImgElement(img)))
  return results.filter(Boolean).length
}

function restoreImgAssetRefs(root: ParentNode) {
  root.querySelectorAll('img').forEach((img) => {
    const assetId = img.getAttribute('data-asset-id') ?? parseAssetId(img.getAttribute('src'))
    if (!assetId) return

    img.setAttribute('data-asset-id', assetId)
    img.setAttribute('src', toAssetUrl(assetId))

    const width = img.getAttribute('data-width')
    const height = img.getAttribute('data-height')
    if (width) img.setAttribute('data-width', width)
    if (height) img.setAttribute('data-height', height)
  })
}

/** 编辑器 HTML（可能是 blob URL）→ 持久化 HTML（asset:// + 宽高属性） */
export function restoreAssetRefsInHtml(html: string): string {
  if (!html.trim()) return html

  const isFullDoc = /<!DOCTYPE/i.test(html) || /^<html[\s>]/i.test(html.trim())
  if (isFullDoc) {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    restoreImgAssetRefs(doc)
    const doctype = html.match(/<!DOCTYPE[^>]*>/i)?.[0] ?? '<!DOCTYPE html>'
    return `${doctype}\n${doc.documentElement.outerHTML}`
  }

  const { root, cleanup } = wrapHtml(html)

  try {
    restoreImgAssetRefs(root)
    return root.innerHTML
  } finally {
    cleanup()
  }
}
