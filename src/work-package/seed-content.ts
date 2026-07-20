import { applyPageSizePlaceholders } from '@/utils/page-size'
import type { WorkPackageManifest } from '@/work-package/types'
import { REFERENCE_IMAGE_FILE } from '@/work-package/types'
import seedArticleHtml from '../../skill-pack/seed-article.html?raw'
import seedMarkdown from '../../skill-pack/seed-文稿.md?raw'

export interface SeedWorkPackageContent {
  markdown: string
  html: string
  assetId: string
  width: number
  height: number
}

function findReferenceAssetId(manifest: WorkPackageManifest): string {
  for (const [id, entry] of Object.entries(manifest.assets)) {
    if (entry.path === REFERENCE_IMAGE_FILE) return id
  }
  throw new Error(`manifest 缺少 ${REFERENCE_IMAGE_FILE}`)
}

function fillSeedTemplate(
  template: string,
  vars: { title: string; assetId: string; width: number; height: number },
): string {
  const filled = template
    .replaceAll('{{TITLE}}', vars.title)
    .replaceAll('{{ASSET_ID}}', vars.assetId)
    .replaceAll('{{WIDTH}}', String(vars.width))
    .replaceAll('{{HEIGHT}}', String(vars.height))
  return applyPageSizePlaceholders(filled)
}

export function buildSeedWorkPackageContent(
  manifest: WorkPackageManifest,
  title: string,
): SeedWorkPackageContent {
  const assetId = findReferenceAssetId(manifest)
  const entry = manifest.assets[assetId]!
  const vars = {
    title: title.trim() || '未命名文稿',
    assetId,
    width: entry.width,
    height: entry.height,
  }

  return {
    markdown: fillSeedTemplate(seedMarkdown, vars),
    html: fillSeedTemplate(seedArticleHtml, vars),
    assetId,
    width: entry.width,
    height: entry.height,
  }
}
