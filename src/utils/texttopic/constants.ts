export const PAGE_W = 1080
export const PAGE_H = 1440

export const BLOCK_TYPES = [
  'cover-title',
  'cover-sub',
  'cover-tag',
  'h1',
  'h2',
  'text',
  'li',
  'quote',
  'img',
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]
