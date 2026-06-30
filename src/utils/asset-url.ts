export const ASSET_URL_PREFIX = 'asset://'

export function toAssetUrl(assetId: string): string {
  return `${ASSET_URL_PREFIX}${assetId}`
}

export function parseAssetId(src: string | null | undefined): string | null {
  if (!src?.startsWith(ASSET_URL_PREFIX)) return null
  const id = src.slice(ASSET_URL_PREFIX.length).trim()
  return id || null
}

export function collectAssetIdsFromHtml(html: string): string[] {
  if (!html.includes(ASSET_URL_PREFIX) && !html.includes('data-asset-id')) return []

  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const ids = new Set<string>()

  doc.querySelectorAll('#root img').forEach((img) => {
    const fromAttr = img.getAttribute('data-asset-id')
    const fromSrc = parseAssetId(img.getAttribute('src'))
    if (fromAttr) ids.add(fromAttr)
    if (fromSrc) ids.add(fromSrc)
  })

  return [...ids]
}

export function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取图片尺寸'))
    }
    img.src = url
  })
}
