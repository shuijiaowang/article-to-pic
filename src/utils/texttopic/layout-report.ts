import { BLOCK_TYPES, PAGE_H, PAGE_W } from '@/utils/texttopic/constants'
import type { BlockMeasure, LayoutReport, PageMeasure } from '@/utils/texttopic/types'

function getBlockType(block: HTMLElement) {
  return BLOCK_TYPES.find((t) => block.classList.contains(t)) ?? 'unknown'
}

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

function measureImageBlock(block: HTMLElement) {
  const img = block.querySelector('img')
  if (!img) {
    return {
      hasImage: false,
      placeholder: block.getAttribute('data-placeholder') || '',
      renderedWidth: Math.round(block.offsetWidth),
      renderedHeight: Math.round(block.offsetHeight),
    }
  }
  return {
    hasImage: true,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    renderedWidth: Math.round(img.offsetWidth),
    renderedHeight: Math.round(img.offsetHeight),
    aspectRatio: img.naturalHeight ? +(img.naturalWidth / img.naturalHeight).toFixed(3) : null,
  }
}

function measureBlock(block: HTMLElement, page: HTMLElement): BlockMeasure {
  const top = blockTopInPage(block, page)
  const height = Math.round(block.offsetHeight)
  const bottom = top + height
  const type = getBlockType(block)
  const data: BlockMeasure = {
    dataId: block.getAttribute('data-id'),
    type,
    top,
    bottom,
    height,
    overflowsCanvas: bottom > PAGE_H,
    clipPx: bottom > PAGE_H ? bottom - PAGE_H : 0,
    inlineStyle: block.getAttribute('style') || '',
    computed: pickComputedStyle(block),
  }
  if (type !== 'img') {
    data.textPreview = textPreview(block)
  } else {
    data.image = measureImageBlock(block)
  }
  return data
}

function measurePage(page: HTMLElement, index: number): PageMeasure {
  const contentHeight = page.scrollHeight
  const overflowPx = Math.max(0, contentHeight - PAGE_H)
  const blocks = [...page.querySelectorAll(':scope > .block')].map((b) =>
    measureBlock(b as HTMLElement, page),
  )
  const overflowBlocks = blocks.filter((b) => b.overflowsCanvas).map((b) => b.dataId).filter(Boolean) as string[]

  return {
    page: page.getAttribute('data-page') || String(index + 1),
    canvas: { width: PAGE_W, height: PAGE_H },
    contentHeight,
    overflow: overflowPx > 2,
    overflowPx: overflowPx > 2 ? overflowPx : 0,
    blockCount: blocks.length,
    blocks,
    overflowBlocks,
  }
}

function buildSummary(pages: PageMeasure[]) {
  const overflowPages = pages.filter((p) => p.overflow)
  if (!overflowPages.length) {
    return `共 ${pages.length} 页，均未超出 ${PAGE_H}px 导出区域。`
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
  const scale = getPreviewScale(scaleRoot)
  docRoot.querySelectorAll('.page-wrap').forEach((wrap) => {
    const el = wrap as HTMLElement
    const h = el.offsetHeight
    el.style.marginBottom = `${h * (scale - 1)}px`
    el.style.marginRight = `${PAGE_W * (scale - 1)}px`
  })
}

export function markOverflowVisual(docRoot: HTMLElement, scaleRoot?: HTMLElement) {
  getPages(docRoot).forEach((page) => {
    const overflow = page.scrollHeight > PAGE_H + 2
    page.classList.toggle('page--overflow', overflow)
    page.querySelectorAll(':scope > .block').forEach((block) => {
      const el = block as HTMLElement
      const top = blockTopInPage(el, page)
      const bottom = top + el.offsetHeight
      el.classList.toggle('block--overflow', bottom > PAGE_H)
    })
  })
  updatePreviewLayout(docRoot, scaleRoot)
}

export function generateLayoutReport(docRoot: HTMLElement, scaleRoot?: HTMLElement): LayoutReport {
  const pages = getPages(docRoot).map(measurePage)
  markOverflowVisual(docRoot, scaleRoot)

  return {
    version: 1,
    tool: 'TextToPic',
    generatedAt: new Date().toISOString(),
    canvas: { width: PAGE_W, height: PAGE_H },
    summary: buildSummary(pages),
    pageCount: pages.length,
    overflowPageCount: pages.filter((p) => p.overflow).length,
    pages,
    aiHint:
      '根据 layoutReport 调整 #doc：优先把 overflowBlocks 拆到新 .page；' +
      '其次减字或改 margin/font-size（白名单）。只改对应 data-id，勿动 head/toolbar/script。',
  }
}
