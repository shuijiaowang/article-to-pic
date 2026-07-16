export const MANIFEST_FILE = 'manifest.json'
export const MD_FILE = '文稿.md'
export const HTML_FILE = 'article.html'
export const SKILL_FILE = 'SKILL.md'
export const ASSETS_DIR = 'assets'

export const MANIFEST_SCHEMA_VERSION = 1

export interface ManifestAssetEntry {
  path: string
  mime: string
  width: number
  height: number
  sha256?: string | null
  bytes: number
}

export interface WorkPackageManifest {
  schemaVersion: number
  packageId: string
  title: string
  updatedAt: string
  activeHtmlFile: string
  assets: Record<string, ManifestAssetEntry>
}

export interface WorkPackageSyncSummary {
  mdChanged: boolean
  htmlChanged: boolean
  assetsAdded: string[]
  assetsUpdated: string[]
  assetsRemoved: string[]
}
