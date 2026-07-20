/** 画布宽度固定；高度可在设置中选择 */
export const PAGE_WIDTH = 1080 as const

export type PageHeightPreset = 1440 | 1800

export interface PageSizeConfig {
  width: typeof PAGE_WIDTH
  height: PageHeightPreset
}

export const PAGE_HEIGHT_OPTIONS: {
  height: PageHeightPreset
  label: string
  hint: string
}[] = [
  { height: 1440, label: '1080 × 1440', hint: '常见竖图比例（4:3 高）' },
  { height: 1800, label: '1080 × 1800', hint: '更长竖图，单页可容纳更多内容' },
]
