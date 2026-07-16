import {
  getArticleAssetsByArticleId,
  getArticleByIdFromDb,
  putArticle,
  saveArticleAsset,
} from '@/storage/db'
import { restoreAssetRefsInHtml } from '@/utils/article-asset-html'
import { readImageDimensions } from '@/utils/asset-url'
import type { Article } from '@/types/document'
import { getActiveHtmlVersion } from '@/types/document'
import { getBoundDirectoryHandle, unbindDirectoryHandle } from '@/work-package/handles'
import { importWorkPackageFolder } from '@/work-package/import-folder'
import {
  createEmptyManifest,
  findAssetIdByPath,
  parseManifestJson,
} from '@/work-package/manifest'
import { workPackageMarkdownToArticle } from '@/work-package/md-bridge'
import { assertSafeAssetFilename } from '@/work-package/paths'
import { ensureDirectoryPermission } from '@/work-package/permission'
import type { WorkPackageSyncSummary } from '@/work-package/types'
import { exportWorkPackageToFolder } from '@/work-package/export-folder'
import {
  fileFingerprint,
  HTML_FILE,
  listAssetFilenames,
  MANIFEST_FILE,
  MD_FILE,
  readAssetFile,
  readTextFile,
} from '@/work-package/fs'

export interface PullFromFolderResult {
  article: Article
  summary: WorkPackageSyncSummary
}

async function importDiskAsset(
  root: FileSystemDirectoryHandle,
  articleId: string,
  filename: string,
  manifest: ReturnType<typeof parseManifestJson>,
  takenIds: Set<string>,
): Promise<'added' | 'updated' | 'unchanged'> {
  const safe = assertSafeAssetFilename(filename)
  const file = await readAssetFile(root, safe)
  if (!file) return 'unchanged'

  const fingerprint = fileFingerprint(file)
  let assetId = findAssetIdByPath(manifest, safe)
  if (!assetId) {
    assetId = crypto.randomUUID()
  }

  const existing = (await getArticleAssetsByArticleId(articleId)).find((a) => a.id === assetId)
  const manifestEntry = manifest.assets[assetId]
  const unchanged =
    existing &&
    manifestEntry?.path === safe &&
    manifestEntry?.sha256 === fingerprint &&
    existing.size === file.size

  if (unchanged) {
    takenIds.add(assetId)
    return 'unchanged'
  }

  const { width, height } = await readImageDimensions(file)
  await saveArticleAsset({
    id: assetId,
    articleId,
    blob: file,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    width,
    height,
    path: safe,
    createdAt: existing?.createdAt,
  })

  manifest.assets[assetId] = {
    path: safe,
    mime: file.type || 'application/octet-stream',
    width,
    height,
    bytes: file.size,
    sha256: fingerprint,
  }
  takenIds.add(assetId)
  return existing ? 'updated' : 'added'
}

/** 从本地文件夹拉取更新（本地优先） */
export async function pullWorkPackageFromFolder(articleId: string): Promise<PullFromFolderResult> {
  const root = await getBoundDirectoryHandle(articleId)
  if (!root) {
    throw new Error('当前文稿未绑定工作包文件夹')
  }

  const permission = await ensureDirectoryPermission(root, 'read')
  if (permission !== 'granted') {
    throw new Error('未获得文件夹读取权限，请重新授权')
  }

  const article = await getArticleByIdFromDb(articleId)
  if (!article) {
    throw new Error('文稿不存在')
  }

  const summary: WorkPackageSyncSummary = {
    mdChanged: false,
    htmlChanged: false,
    assetsAdded: [],
    assetsUpdated: [],
    assetsRemoved: [],
  }

  const manifestRaw = await readTextFile(root, MANIFEST_FILE)
  const manifest = manifestRaw
    ? parseManifestJson(manifestRaw)
    : createEmptyManifest(articleId, article.title)

  // 先入库图片，再解析文稿，保证 asset:// / ./assets 都能对上
  const takenIds = new Set<string>()
  const diskAssets = await listAssetFilenames(root)
  const pathsToScan = new Set<string>([
    ...diskAssets,
    ...Object.values(manifest.assets).map((a) => a.path),
  ])

  for (const path of pathsToScan) {
    const result = await importDiskAsset(root, articleId, path, manifest, takenIds)
    if (result === 'added') summary.assetsAdded.push(path)
    if (result === 'updated') summary.assetsUpdated.push(path)
  }

  const mdRaw = await readTextFile(root, MD_FILE)
  if (mdRaw?.trim()) {
    const pendingPaths = new Map<string, string>()
    const parsed = workPackageMarkdownToArticle(mdRaw, manifest, pendingPaths)

    // MD 里新出现的相对路径：补入库（manifest 可能尚无）
    for (const [path, pendingId] of pendingPaths) {
      if (takenIds.has(pendingId)) continue
      const file = await readAssetFile(root, path)
      if (!file) continue
      const { width, height } = await readImageDimensions(file)
      await saveArticleAsset({
        id: pendingId,
        articleId,
        blob: file,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        width,
        height,
        path,
      })
      manifest.assets[pendingId] = {
        path,
        mime: file.type || 'application/octet-stream',
        width,
        height,
        bytes: file.size,
        sha256: fileFingerprint(file),
      }
      takenIds.add(pendingId)
      summary.assetsAdded.push(path)
    }

    const changed =
      parsed.title !== article.title ||
      parsed.cover !== article.cover ||
      parsed.body !== article.body ||
      parsed.notes !== article.notes

    if (changed) {
      article.title = parsed.title
      article.cover = parsed.cover
      article.body = parsed.body
      article.notes = parsed.notes
      summary.mdChanged = true
    }
  }

  const htmlRaw = await readTextFile(root, HTML_FILE)
  if (htmlRaw?.trim()) {
    const normalized = restoreAssetRefsInHtml(htmlRaw)
    const active = getActiveHtmlVersion(article)
    if (active?.html !== normalized) {
      const versionId = crypto.randomUUID()
      if (!article.htmlVersions) article.htmlVersions = []
      article.htmlVersions.push({
        id: versionId,
        html: normalized,
        createdAt: Date.now(),
        label: '本地更新',
        summary: `从 ${HTML_FILE} 同步`,
      })
      article.activeHtmlVersionId = versionId
      summary.htmlChanged = true
    }
  }

  const browserAssets = await getArticleAssetsByArticleId(articleId)
  for (const asset of browserAssets) {
    if (asset.path && !diskAssets.includes(asset.path) && !takenIds.has(asset.id)) {
      summary.assetsRemoved.push(asset.path)
    }
  }

  article.updatedAt = Date.now()
  article.binding = {
    folderName: root.name,
    lastSyncedAt: Date.now(),
    lastLocalScanAt: Date.now(),
    permission: 'granted',
  }

  await putArticle(article)

  return { article, summary }
}

/** 将网站状态推送到本地文件夹 */
export async function pushWorkPackageToFolder(articleId: string) {
  const article = await getArticleByIdFromDb(articleId)
  if (!article) throw new Error('文稿不存在')
  return exportWorkPackageToFolder(article)
}

/** 打开文件夹选择器并绑定 / 导入 */
export async function openWorkPackageFolder(): Promise<import('@/work-package/import-folder').ImportFolderResult> {
  if (typeof window.showDirectoryPicker !== 'function') {
    throw new Error('当前浏览器不支持文件夹选择（请使用 Chrome / Edge）')
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  return importWorkPackageFolder(handle)
}

export async function unbindWorkPackage(articleId: string): Promise<void> {
  await unbindDirectoryHandle(articleId)
  const article = await getArticleByIdFromDb(articleId)
  if (article) {
    const { binding: _binding, ...rest } = article
    await putArticle(rest)
  }
}
