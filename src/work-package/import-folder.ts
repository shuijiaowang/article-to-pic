import { putArticle, saveArticleAsset } from '@/storage/db'
import { restoreAssetRefsInHtml } from '@/utils/article-asset-html'
import { stripPreviewScripts } from '@/utils/parse-html'
import { readImageDimensions } from '@/utils/asset-url'
import type { Article } from '@/types/document'
import { migrateArticle } from '@/types/document'
import { bindDirectoryHandle } from '@/work-package/handles'
import {
  createEmptyManifest,
  findAssetIdByPath,
  parseManifestJson,
} from '@/work-package/manifest'
import { workPackageMarkdownToArticle } from '@/work-package/md-bridge'
import { assertSafeAssetFilename } from '@/work-package/paths'
import { ensureDirectoryPermission } from '@/work-package/permission'
import { writeInitialWorkPackageFiles } from '@/work-package/export-folder'
import type { WorkPackageManifest } from '@/work-package/types'
import {
  HTML_FILE,
  listAssetFilenames,
  MANIFEST_FILE,
  MD_FILE,
  readAssetFile,
  readTextFile,
} from '@/work-package/fs'

export interface ImportFolderResult {
  article: Article
  manifest: WorkPackageManifest
  summary: {
    assetsImported: number
    htmlImported: boolean
  }
}

async function importAssetFromDisk(
  root: FileSystemDirectoryHandle,
  articleId: string,
  manifest: WorkPackageManifest,
  filename: string,
  takenIds: Set<string>,
): Promise<void> {
  const safe = assertSafeAssetFilename(filename)
  const file = await readAssetFile(root, safe)
  if (!file) return

  let assetId = findAssetIdByPath(manifest, safe)
  if (!assetId || takenIds.has(assetId)) {
    assetId = crypto.randomUUID()
  }
  takenIds.add(assetId)

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
  })

  manifest.assets[assetId] = {
    path: safe,
    mime: file.type || 'application/octet-stream',
    width,
    height,
    bytes: file.size,
    sha256: `${file.size}:${file.lastModified}`,
  }
}

function buildArticleFromImport(
  packageId: string,
  title: string,
  input: ReturnType<typeof workPackageMarkdownToArticle>,
  html: string | null,
  folderName: string,
): Article {
  const now = Date.now()
  const article: Article = migrateArticle({
    id: packageId,
    title,
    cover: input.cover,
    body: input.body,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
    htmlVersions: [],
    binding: {
      folderName,
      lastSyncedAt: now,
      permission: 'granted',
    },
  })

  if (html?.trim()) {
    const versionId = crypto.randomUUID()
    article.htmlVersions = [
      {
        id: versionId,
        html: stripPreviewScripts(restoreAssetRefsInHtml(html)),
        createdAt: now,
        label: '本地导入',
        summary: `从 ${HTML_FILE} 导入`,
      },
    ]
    article.activeHtmlVersionId = versionId
  }

  return article
}

/** 从已选文件夹导入工作包（本地优先覆盖浏览器副本） */
export async function importWorkPackageFolder(
  directoryHandle: FileSystemDirectoryHandle,
): Promise<ImportFolderResult> {
  const permission = await ensureDirectoryPermission(directoryHandle, 'readwrite')
  if (permission !== 'granted') {
    throw new Error('未获得文件夹读写权限')
  }

  const manifestRaw = await readTextFile(directoryHandle, MANIFEST_FILE)
  let manifest: WorkPackageManifest
  if (manifestRaw) {
    manifest = parseManifestJson(manifestRaw)
  } else {
    const mdPreview = await readTextFile(directoryHandle, MD_FILE)
    const titleMatch = mdPreview?.match(/^#\s+(.+)$/m)
    manifest = createEmptyManifest(
      crypto.randomUUID(),
      titleMatch?.[1]?.trim() || directoryHandle.name || '未命名文稿',
    )
  }

  const packageId = manifest.packageId
  const takenIds = new Set<string>()
  const pendingPaths = new Map<string, string>()

  const mdRaw = await readTextFile(directoryHandle, MD_FILE)
  if (!mdRaw?.trim()) {
    throw new Error(`工作包缺少 ${MD_FILE}`)
  }

  const articleInput = workPackageMarkdownToArticle(mdRaw, manifest, pendingPaths)

  const diskAssets = await listAssetFilenames(directoryHandle)
  const pathsToImport = new Set<string>([
    ...Object.values(manifest.assets).map((a) => a.path),
    ...diskAssets,
    ...pendingPaths.keys(),
  ])

  let assetsImported = 0
  for (const path of pathsToImport) {
    await importAssetFromDisk(directoryHandle, packageId, manifest, path, takenIds)
    assetsImported++
  }

  const htmlRaw = await readTextFile(directoryHandle, HTML_FILE)
  const article = buildArticleFromImport(
    packageId,
    manifest.title || articleInput.title,
    articleInput,
    htmlRaw,
    directoryHandle.name,
  )

  await putArticle(article)
  await bindDirectoryHandle(packageId, directoryHandle)

  return {
    article,
    manifest,
    summary: {
      assetsImported,
      htmlImported: Boolean(htmlRaw?.trim()),
    },
  }
}

/** 新建工作包：选目录并写出初始文件 */
export async function createAndBindWorkPackageFolder(
  article: Article,
): Promise<ImportFolderResult> {
  if (typeof window.showDirectoryPicker !== 'function') {
    throw new Error('当前浏览器不支持文件夹选择（请使用 Chrome / Edge）')
  }

  const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
  const permission = await ensureDirectoryPermission(directoryHandle, 'readwrite')
  if (permission !== 'granted') {
    throw new Error('未获得文件夹读写权限')
  }

  const manifest = await writeInitialWorkPackageFiles(directoryHandle, article)

  const bound: Article = {
    ...article,
    binding: {
      folderName: directoryHandle.name,
      lastSyncedAt: Date.now(),
      permission: 'granted',
    },
  }
  await putArticle(bound)
  await bindDirectoryHandle(article.id, directoryHandle)

  return {
    article: bound,
    manifest,
    summary: { assetsImported: 0, htmlImported: false },
  }
}
