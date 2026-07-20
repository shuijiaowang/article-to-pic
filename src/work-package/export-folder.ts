import { getArticleAssetsByArticleId, putArticle, saveArticleAsset } from '@/storage/db'
import { restoreAssetRefsInHtml } from '@/utils/article-asset-html'
import { stripPreviewScripts } from '@/utils/parse-html'
import { getActiveHtmlVersion } from '@/types/document'
import type { Article, ArticleInput } from '@/types/document'
import { buildSeedWorkPackageContent } from '@/work-package/seed-content'
import { articleToWorkPackageMarkdown } from '@/work-package/md-bridge'
import {
  buildManifestFromAssets,
  createEmptyManifest,
  parseManifestJson,
  stringifyManifest,
} from '@/work-package/manifest'
import { assertSafeAssetFilename, uniqueAssetFilename } from '@/work-package/paths'
import { ensureDirectoryPermission } from '@/work-package/permission'
import { applyPageSizePlaceholders } from '@/utils/page-size'
import type { WorkPackageManifest } from '@/work-package/types'
import {
  REFERENCE_IMAGE_FILE,
  SKILL_FILE,
  SYNC_MANIFEST_FILE,
  XHS_COPY_FILE,
} from '@/work-package/types'
import { getBoundDirectoryHandle } from '@/work-package/handles'
import {
  fileFingerprint,
  HTML_FILE,
  MANIFEST_FILE,
  MD_FILE,
  writeAssetFile,
  writeTextFile,
  readTextFile,
} from '@/work-package/fs'
import skillMd from '../../skill-pack/SKILL.md?raw'
import syncManifestScript from '../../skill-pack/sync-manifest.mjs?raw'
import xhsCopyTemplate from '../../skill-pack/小红书标题正文话题.md?raw'
import referenceImageUrl from '../../skill-pack/参考图.png?url'

export interface ExportFolderResult {
  manifest: WorkPackageManifest
  filesWritten: string[]
  article: Article
}

function pathMapFromManifest(manifest: WorkPackageManifest): Map<string, string> {
  const map = new Map<string, string>()
  for (const [id, entry] of Object.entries(manifest.assets)) {
    map.set(id, entry.path)
  }
  return map
}

/** 将当前文稿状态写入已绑定文件夹（网站优先） */
export async function exportWorkPackageToFolder(article: Article): Promise<ExportFolderResult> {
  const root = await getBoundDirectoryHandle(article.id)
  if (!root) {
    throw new Error('当前文稿未绑定工作包文件夹')
  }

  const permission = await ensureDirectoryPermission(root, 'readwrite')
  if (permission !== 'granted') {
    throw new Error('未获得文件夹读写权限，请重新授权')
  }

  const assets = await getArticleAssetsByArticleId(article.id)
  const taken = new Set(assets.map((a) => a.path).filter(Boolean) as string[])

  for (const asset of assets) {
    if (!asset.path) {
      asset.path = uniqueAssetFilename(`${asset.id.slice(0, 8)}.png`, taken)
      taken.add(asset.path)
      await saveArticleAsset(asset)
    }
  }

  const manifestRaw = await readTextFile(root, MANIFEST_FILE)
  const baseManifest = manifestRaw
    ? parseManifestJson(manifestRaw)
    : createEmptyManifest(article.id, article.title)

  const manifest = buildManifestFromAssets(
    {
      ...baseManifest,
      packageId: article.id,
      title: article.title,
      activeHtmlFile: HTML_FILE,
    },
    assets.map((a) => ({
      id: a.id,
      path: a.path,
      mime: a.mime,
      width: a.width,
      height: a.height,
      size: a.size,
    })),
  )
  for (const [assetId, entry] of Object.entries(baseManifest.assets)) {
    if (!manifest.assets[assetId]) {
      manifest.assets[assetId] = entry
    }
  }

  const pathByAssetId = pathMapFromManifest(manifest)
  const filesWritten: string[] = []

  await writeTextFile(root, MANIFEST_FILE, stringifyManifest(manifest))
  filesWritten.push(MANIFEST_FILE)

  const md = articleToWorkPackageMarkdown(article, pathByAssetId)
  await writeTextFile(root, MD_FILE, md)
  filesWritten.push(MD_FILE)

  await writeTextFile(root, SKILL_FILE, applyPageSizePlaceholders(skillMd))
  filesWritten.push(SKILL_FILE)

  await writeTextFile(root, SYNC_MANIFEST_FILE, syncManifestScript)
  filesWritten.push(SYNC_MANIFEST_FILE)

  const activeHtml = getActiveHtmlVersion(article)?.html
  if (activeHtml?.trim()) {
    await writeTextFile(
      root,
      HTML_FILE,
      stripPreviewScripts(restoreAssetRefsInHtml(activeHtml)),
    )
    filesWritten.push(HTML_FILE)
  }

  for (const asset of assets) {
    if (!asset.path) continue
    await writeAssetFile(root, asset.path, asset.blob)
    filesWritten.push(`assets/${asset.path}`)
  }

  const updated: Article = {
    ...article,
    binding: {
      folderName: root.name,
      lastSyncedAt: Date.now(),
      permission: 'granted',
    },
  }
  await putArticle(updated)

  return { manifest, filesWritten, article: updated }
}

async function writeSeedReferenceImage(
  root: FileSystemDirectoryHandle,
  manifest: WorkPackageManifest,
): Promise<WorkPackageManifest> {
  const response = await fetch(referenceImageUrl)
  const blob = await response.blob()
  await writeAssetFile(root, REFERENCE_IMAGE_FILE, blob)

  const bitmap = await createImageBitmap(blob)
  const assetId = crypto.randomUUID()
  const next: WorkPackageManifest = {
    ...manifest,
    updatedAt: new Date().toISOString(),
    assets: {
      ...manifest.assets,
      [assetId]: {
        path: REFERENCE_IMAGE_FILE,
        mime: blob.type || 'image/png',
        width: bitmap.width,
        height: bitmap.height,
        bytes: blob.size,
        sha256: fileFingerprint(
          new File([blob], REFERENCE_IMAGE_FILE, { type: blob.type || 'image/png' }),
        ),
      },
    },
  }
  bitmap.close()
  return next
}

/** 新建绑定：写出示例文稿、HTML、配图与辅助文件 */
export async function writeInitialWorkPackageFiles(
  root: FileSystemDirectoryHandle,
  article: ArticleInput & { id: string },
): Promise<WorkPackageManifest> {
  let manifest = createEmptyManifest(article.id, article.title)
  manifest = await writeSeedReferenceImage(root, manifest)

  const seed = buildSeedWorkPackageContent(manifest, article.title)

  await writeTextFile(root, MANIFEST_FILE, stringifyManifest(manifest))
  await writeTextFile(root, MD_FILE, seed.markdown)
  await writeTextFile(root, HTML_FILE, seed.html)
  await writeTextFile(root, SKILL_FILE, applyPageSizePlaceholders(skillMd))
  await writeTextFile(root, SYNC_MANIFEST_FILE, syncManifestScript)
  await writeTextFile(root, XHS_COPY_FILE, xhsCopyTemplate)
  return manifest
}

/** 网站上传图片后双写到 assets/ 并更新 manifest */
export async function syncAssetToFolder(
  articleId: string,
  asset: { id: string; path: string; blob: Blob; mime: string; width: number; height: number; size: number },
): Promise<void> {
  const root = await getBoundDirectoryHandle(articleId)
  if (!root) return

  const permission = await ensureDirectoryPermission(root, 'readwrite')
  if (permission !== 'granted') return

  await writeAssetFile(root, asset.path, asset.blob)

  const manifestRaw = await readTextFile(root, MANIFEST_FILE)
  const manifest = manifestRaw
    ? parseManifestJson(manifestRaw)
    : createEmptyManifest(articleId, '')

  manifest.assets[asset.id] = {
    path: assertSafeAssetFilename(asset.path),
    mime: asset.mime,
    width: asset.width,
    height: asset.height,
    bytes: asset.size,
    sha256: fileFingerprint(new File([asset.blob], asset.path, { type: asset.mime })),
  }
  manifest.updatedAt = new Date().toISOString()
  await writeTextFile(root, MANIFEST_FILE, stringifyManifest(manifest))
}

export async function pickUniqueAssetPath(
  articleId: string,
  desiredName: string,
): Promise<string> {
  const assets = await getArticleAssetsByArticleId(articleId)
  const taken = new Set(assets.map((a) => a.path).filter(Boolean) as string[])
  return uniqueAssetFilename(desiredName, taken)
}
