import type { BlockType } from '@/utils/texttopic/constants'

export interface BlockComputedStyle {
  fontSize: string
  lineHeight: string
  marginTop: string
  marginBottom: string
  padding: string
}

export interface ImageBlockMeasure {
  hasImage: boolean
  placeholder?: string
  naturalWidth?: number
  naturalHeight?: number
  renderedWidth: number
  renderedHeight: number
  aspectRatio?: number | null
}

export interface BlockMeasure {
  dataId: string | null
  type: BlockType | 'unknown'
  top: number
  bottom: number
  height: number
  overflowsCanvas: boolean
  clipPx: number
  inlineStyle: string
  computed: BlockComputedStyle
  textPreview?: string
  image?: ImageBlockMeasure
}

export interface PageMeasure {
  page: string
  canvas: { width: number; height: number }
  contentHeight: number
  overflow: boolean
  overflowPx: number
  blockCount: number
  blocks: BlockMeasure[]
  overflowBlocks: string[]
}

export interface LayoutReport {
  version: 1
  tool: 'TextToPic'
  generatedAt: string
  canvas: { width: number; height: number }
  summary: string
  pageCount: number
  overflowPageCount: number
  pages: PageMeasure[]
  aiHint: string
}
