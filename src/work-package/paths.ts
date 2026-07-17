import { ASSETS_DIR } from '@/work-package/types'

/** 字母、数字、中文、点、下划线、连字符；禁止路径分隔符与空白 */
const SAFE_FILENAME = /^[A-Za-z0-9\u4e00-\u9fff._-]+$/

export function assertSafeAssetFilename(path: string): string {
  const normalized = path.replace(/\\/g, '/').trim()
  if (!normalized || normalized.includes('/') || normalized.includes('..')) {
    throw new Error(`非法资源路径：${path}`)
  }
  if (!SAFE_FILENAME.test(normalized)) {
    throw new Error(`资源文件名仅允许字母、数字、中文、点、下划线、连字符：${path}`)
  }
  return normalized
}

export function toRelativeAssetPath(filename: string): string {
  return `./${ASSETS_DIR}/${assertSafeAssetFilename(filename)}`
}

export function parseRelativeAssetPath(src: string): string | null {
  const trimmed = src.trim()
  const m = /^(?:\.\/)?assets\/([^/?#]+)$/i.exec(trimmed)
  if (!m?.[1]) return null
  try {
    return assertSafeAssetFilename(m[1])
  } catch {
    return null
  }
}

export function sanitizeAssetFilename(name: string, fallbackExt = '.png'): string {
  const base = name.replace(/\.[^.]+$/, '')
  const extMatch = /\.([A-Za-z0-9]+)$/.exec(name)
  const ext = extMatch?.[1] ? `.${extMatch[1].toLowerCase()}` : fallbackExt
  const safe = base
    .replace(/[^\w\u4e00-\u9fff-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const stem = safe || 'image'
  return assertSafeAssetFilename(`${stem}${ext}`)
}

export function uniqueAssetFilename(desired: string, taken: Set<string>): string {
  const safe = sanitizeAssetFilename(desired)
  if (!taken.has(safe)) return safe
  const extMatch = /\.([A-Za-z0-9]+)$/.exec(safe)
  const ext = extMatch ? extMatch[0] : '.png'
  const stem = safe.slice(0, safe.length - ext.length)
  for (let i = 2; i < 1000; i++) {
    const candidate = assertSafeAssetFilename(`${stem}-${i}${ext}`)
    if (!taken.has(candidate)) return candidate
  }
  return assertSafeAssetFilename(`${stem}-${crypto.randomUUID().slice(0, 8)}${ext}`)
}

export { ASSETS_DIR }
