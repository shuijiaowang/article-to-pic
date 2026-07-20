import {
  PAGE_HEIGHT_OPTIONS,
  PAGE_WIDTH,
  type PageHeightPreset,
  type PageSizeConfig,
} from '@/types/page-settings'

export const PAGE_SETTINGS_STORAGE_KEY = 'article-to-pic:page-settings'

const DEFAULT_HEIGHT: PageHeightPreset = 1440

function isPageHeightPreset(n: unknown): n is PageHeightPreset {
  return n === 1440 || n === 1800
}

/** 同步读取全局画布配置（布局、导出、提示词拼接均用此入口） */
export function loadPageSizeConfig(): PageSizeConfig {
  try {
    const raw = localStorage.getItem(PAGE_SETTINGS_STORAGE_KEY)
    if (!raw) {
      return { width: PAGE_WIDTH, height: DEFAULT_HEIGHT }
    }
    const parsed = JSON.parse(raw) as { height?: unknown }
    const height = isPageHeightPreset(parsed.height) ? parsed.height : DEFAULT_HEIGHT
    return { width: PAGE_WIDTH, height }
  } catch {
    return { width: PAGE_WIDTH, height: DEFAULT_HEIGHT }
  }
}

export function savePageSizeConfig(partial: { height: PageHeightPreset }) {
  localStorage.setItem(
    PAGE_SETTINGS_STORAGE_KEY,
    JSON.stringify({ height: partial.height }),
  )
}

export function getCanvasLabel(config: PageSizeConfig = loadPageSizeConfig()): string {
  return `${config.width}×${config.height}`
}

/** PNG 导出倍率（3 = 3240×4320 或 3240×5400） */
export const EXPORT_SCALE = 3

export function getExportDimensions(config: PageSizeConfig = loadPageSizeConfig()) {
  return {
    scale: EXPORT_SCALE,
    width: config.width * EXPORT_SCALE,
    height: config.height * EXPORT_SCALE,
    pageWidth: config.width,
    pageHeight: config.height,
  }
}

/** 替换模板 / 提示词 / SKILL 中的 {{PAGE_W}}、{{PAGE_H}}、{{CANVAS_LABEL}} */
export function applyPageSizePlaceholders(
  text: string,
  config: PageSizeConfig = loadPageSizeConfig(),
): string {
  const label = getCanvasLabel(config)
  return text
    .replaceAll('{{PAGE_W}}', String(config.width))
    .replaceAll('{{PAGE_H}}', String(config.height))
    .replaceAll('{{CANVAS_LABEL}}', label)
}

export { PAGE_HEIGHT_OPTIONS, PAGE_WIDTH }
