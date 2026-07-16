import {
  MANIFEST_FILE,
  MANIFEST_SCHEMA_VERSION,
  type ManifestAssetEntry,
  type WorkPackageManifest,
} from '@/work-package/types'
import { assertSafeAssetFilename } from '@/work-package/paths'

export function createEmptyManifest(packageId: string, title: string): WorkPackageManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    packageId,
    title,
    updatedAt: new Date().toISOString(),
    activeHtmlFile: 'article.html',
    assets: {},
  }
}

export function parseManifestJson(raw: string): WorkPackageManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${MANIFEST_FILE} 不是合法 JSON`)
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`${MANIFEST_FILE} 格式无效`)
  }
  const obj = parsed as Partial<WorkPackageManifest>
  if (obj.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(`不支持的 manifest schemaVersion：${String(obj.schemaVersion)}`)
  }
  if (!obj.packageId || typeof obj.packageId !== 'string') {
    throw new Error('manifest 缺少 packageId')
  }
  if (!obj.assets || typeof obj.assets !== 'object') {
    throw new Error('manifest 缺少 assets')
  }

  const assets: Record<string, ManifestAssetEntry> = {}
  for (const [id, entry] of Object.entries(obj.assets)) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Partial<ManifestAssetEntry>
    if (!e.path || typeof e.path !== 'string') continue
    assets[id] = {
      path: assertSafeAssetFilename(e.path),
      mime: e.mime || 'application/octet-stream',
      width: Number(e.width) || 0,
      height: Number(e.height) || 0,
      sha256: e.sha256 ?? null,
      bytes: Number(e.bytes) || 0,
    }
  }

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    packageId: obj.packageId,
    title: typeof obj.title === 'string' ? obj.title : '未命名文稿',
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
    activeHtmlFile: typeof obj.activeHtmlFile === 'string' ? obj.activeHtmlFile : 'article.html',
    assets,
  }
}

export function stringifyManifest(manifest: WorkPackageManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

export function findAssetIdByPath(
  manifest: WorkPackageManifest,
  path: string,
): string | null {
  const safe = assertSafeAssetFilename(path)
  for (const [id, entry] of Object.entries(manifest.assets)) {
    if (entry.path === safe) return id
  }
  return null
}

export function buildManifestFromAssets(
  base: WorkPackageManifest,
  records: Array<{
    id: string
    path?: string
    mime: string
    width: number
    height: number
    size: number
  }>,
): WorkPackageManifest {
  const assets: Record<string, ManifestAssetEntry> = {}
  for (const record of records) {
    if (!record.path) continue
    assets[record.id] = {
      path: assertSafeAssetFilename(record.path),
      mime: record.mime,
      width: record.width,
      height: record.height,
      bytes: record.size,
      sha256: base.assets[record.id]?.sha256 ?? null,
    }
  }
  return {
    ...base,
    updatedAt: new Date().toISOString(),
    assets,
  }
}
