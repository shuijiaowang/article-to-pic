import { loadPageSizeConfig } from '@/utils/page-size'
import {
  getBlockRole,
  isImageContentBlock,
  queryPageBlocks,
} from '@/utils/texttopic/block-dom'
import type { BlockMeasure, LayoutReport, PageMeasure } from '@/utils/texttopic/types'

function textPreview(block: HTMLElement) {
  const text = (block.getAttribute('data-placeholder') || block.textContent || '').trim()
  return text.length > 40 ? `${text.slice(0, 40)}…` : text
}

function blockTopInPage(block: HTMLElement, page: HTMLElement) {
  let top = 0
  let node: HTMLElement | null = block
  while (node && node !== page) {
    top += node.offsetTop
    node = node.offsetParent as HTMLElement | null
    if (node && node !== page && !page.contains(node)) break
  }
  return Math.round(top)
}

function pickComputedStyle(block: HTMLElement) {
  const cs = getComputedStyle(block)
  return {
    fontSize: cs.fontSize,
    lineHeight: cs.lineHeight,
    marginTop: cs.marginTop,
    marginBottom: cs.marginBottom,
    padding: cs.padding,
  }
}

function parseMetaDimension(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function measureImageBlock(block: HTMLElement) {
  const img = block.querySelector('img')
  const assetId =
    block.getAttribute('data-asset-id') ??
    img?.getAttribute('data-asset-id') ??
    undefined
  const metaWidth =
    parseMetaDimension(block.getAttribute('data-width')) ??
    parseMetaDimension(img?.getAttribute('data-width'))
  const metaHeight =
    parseMetaDimension(block.getAttribute('data-height')) ??
    parseMetaDimension(img?.getAttribute('data-height'))

  if (!img) {
    return {
      hasImage: false,
      assetId,
      placeholder: block.getAttribute('data-placeholder') || '',
      naturalWidth: metaWidth,
      naturalHeight: metaHeight,
      renderedWidth: Math.round(block.offsetWidth),
      renderedHeight: Math.round(block.offsetHeight),
      aspectRatio:
        metaWidth && metaHeight ? +(metaWidth / metaHeight).toFixed(3) : null,
    }
  }

  const naturalWidth = img.naturalWidth || metaWidth
  const naturalHeight = img.naturalHeight || metaHeight

  return {
    hasImage: true,
    assetId,
    naturalWidth,
    naturalHeight,
    renderedWidth: Math.round(img.offsetWidth),
    renderedHeight: Math.round(img.offsetHeight),
    aspectRatio:
      naturalWidth && naturalHeight
        ? +(naturalWidth / naturalHeight).toFixed(3)
        : null,
  }
}

function measureBlock(block: HTMLElement, page: HTMLElement, pageHeight: number): BlockMeasure {
  const top = blockTopInPage(block, page)
  const height = Math.round(block.offsetHeight)
  const bottom = top + height
  const type = getBlockRole(block)
  const asImage = isImageContentBlock(block)
  const data: BlockMeasure = {
    dataId: block.getAttribute('data-id'),
    type,
    top,
    bottom,
    height,
    overflowsCanvas: bottom > pageHeight,
    clipPx: bottom > pageHeight ? bottom - pageHeight : 0,
    inlineStyle: block.getAttribute('style') || '',
    computed: pickComputedStyle(block),
  }
  if (asImage) {
    data.image = measureImageBlock(block)
    const preview = textPreview(block)
    if (preview) data.textPreview = preview
  } else {
    data.textPreview = textPreview(block)
  }
  return data
}

function measurePage(
  page: HTMLElement,
  index: number,
  pageWidth: number,
  pageHeight: number,
): PageMeasure {
  const contentHeight = page.scrollHeight
  const overflowPx = Math.max(0, contentHeight - pageHeight)
  const blocks = queryPageBlocks(page).map((b) => measureBlock(b, page, pageHeight))
  const overflowBlocks = blocks
    .filter((b) => b.overflowsCanvas)
    .map((b) => b.dataId)
    .filter(Boolean) as string[]

  return {
    page: page.getAttribute('data-page') || String(index + 1),
    canvas: { width: pageWidth, height: pageHeight },
    contentHeight,
    overflow: overflowPx > 2,
    overflowPx: overflowPx > 2 ? overflowPx : 0,
    blockCount: blocks.length,
    blocks,
    overflowBlocks,
  }
}

function buildSummary(pages: PageMeasure[], pageHeight: number) {
  const overflowPages = pages.filter((p) => p.overflow)
  if (!overflowPages.length) {
    return `共 ${pages.length} 页，均未超出 ${pageHeight}px 导出区域。`
  }
  const details = overflowPages.map(
    (p) => `第 ${p.page} 页超出 ${p.overflowPx}px（块: ${p.overflowBlocks.join(', ') || '—'}）`,
  )
  return `共 ${pages.length} 页，${overflowPages.length} 页溢出。${details.join('；')}。`
}

export function getPages(docRoot: HTMLElement) {
  return [...docRoot.querySelectorAll('.page')] as HTMLElement[]
}

export function getPreviewScale(root: HTMLElement = document.documentElement) {
  const raw = getComputedStyle(root).getPropertyValue('--preview-scale').trim()
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : 0.38
}

export function updatePreviewLayout(docRoot: HTMLElement, scaleRoot?: HTMLElement) {
  const { width: pageWidth } = loadPageSizeConfig()
  const scale = getPreviewScale(scaleRoot)
  docRoot.querySelectorAll('.page-wrap').forEach((wrap) => {
    const el = wrap as HTMLElement
    const h = el.offsetHeight
    el.style.marginBottom = `${h * (scale - 1)}px`
    el.style.marginRight = `${pageWidth * (scale - 1)}px`
  })
}

export function markOverflowVisual(docRoot: HTMLElement, scaleRoot?: HTMLElement) {
  const { height: pageHeight } = loadPageSizeConfig()
  getPages(docRoot).forEach((page) => {
    const overflow = page.scrollHeight > pageHeight + 2
    page.classList.toggle('page--overflow', overflow)
    queryPageBlocks(page).forEach((block) => {
      const top = blockTopInPage(block, page)
      const bottom = top + block.offsetHeight
      block.classList.toggle('block--overflow', bottom > pageHeight)
    })
  })
  updatePreviewLayout(docRoot, scaleRoot)
}

export function generateLayoutReport(docRoot: HTMLElement, scaleRoot?: HTMLElement): LayoutReport {
  const { width: PAGE_W, height: PAGE_H } = loadPageSizeConfig()
  const pages = getPages(docRoot).map((page, index) => measurePage(page, index, PAGE_W, PAGE_H))
  markOverflowVisual(docRoot, scaleRoot)

  return {
    version: 1,
    tool: 'TextToPic',
    generatedAt: new Date().toISOString(),
    canvas: { width: PAGE_W, height: PAGE_H },
    summary: buildSummary(pages, PAGE_H),
    pageCount: pages.length,
    overflowPageCount: pages.filter((p) => p.overflow).length,
    pages,
    aiHint:
      '流水排版：装不下的单元移到紧邻下一页顶部续排，不必硬压本页；' +
      '禁止搬到 distant 页，保持 data-id / DOM 顺序。' +
      '图片可看 blocks[].image（原图/渲染尺寸、data-asset-id）：溢出时缩小 width% 或移到下一页，勿删 data-asset-id。',
  }
}
