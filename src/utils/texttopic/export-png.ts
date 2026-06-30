import html2canvas from 'html2canvas'
import { EXPORT_SCALE, PAGE_H, PAGE_W } from '@/utils/texttopic/constants'
import { getPages } from '@/utils/texttopic/layout-report'

const DEFAULT_MARK_BG = '#fef08a'

type HighlightSnapshot = {
  el: HTMLElement
  innerHTML: string
  className: string
  style: string
}

function isTransparentBackground(color: string) {
  return !color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)'
}

function hasHighlightBackground(el: HTMLElement) {
  const bg = getComputedStyle(el).backgroundColor
  return !isTransparentBackground(bg)
}

/** 行内高亮（mark / 带背景色的 inline 元素），不含整块 .block */
function isInlineHighlight(el: HTMLElement) {
  if (el.classList.contains('block')) return false
  const display = getComputedStyle(el).display
  if (display === 'block' || display === 'flex' || display === 'none') return false
  if (el.tagName === 'MARK') return true
  return hasHighlightBackground(el)
}

/** 拆成尽量短的片段，避免 html2canvas 把多行 inline 背景画成整块矩形盖住同行文字 */
function splitHighlightSegments(text: string) {
  const segments: string[] = []
  let latin = ''

  for (const char of text) {
    if (/\s/.test(char)) {
      if (latin) {
        segments.push(latin)
        latin = ''
      }
      segments.push(char)
      continue
    }

    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/.test(char)) {
      if (latin) {
        segments.push(latin)
        latin = ''
      }
      segments.push(char)
      continue
    }

    latin += char
  }

  if (latin) segments.push(latin)
  return segments.filter((segment) => segment.length > 0)
}

function wrapHighlightSegment(segment: string, backgroundColor: string) {
  const span = document.createElement('span')
  span.textContent = segment
  span.style.backgroundColor = backgroundColor
  span.style.boxDecorationBreak = 'clone'
  span.style.setProperty('-webkit-box-decoration-break', 'clone')
  return span.outerHTML
}

/**
 * html2canvas #548：行内 background 会按整块 bounding box 绘制，盖住同行非高亮文字。
 * 导出前把高亮拆成更短的 span，导出后还原 DOM。
 */
function prepareInlineHighlightsForExport(root: HTMLElement) {
  const snapshots: HighlightSnapshot[] = []

  const candidates = Array.from(
    root.querySelectorAll('mark, span, strong, em, b, i, u, a'),
  ).filter((node) => isInlineHighlight(node as HTMLElement)) as HTMLElement[]

  const leaves = candidates.filter((el) => {
    return !Array.from(el.querySelectorAll('mark, span, strong, em, b, i, u, a')).some((child) =>
      isInlineHighlight(child as HTMLElement),
    )
  })

  for (const el of leaves) {
    const text = el.textContent ?? ''
    if (!text) continue

    snapshots.push({
      el,
      innerHTML: el.innerHTML,
      className: el.className,
      style: el.getAttribute('style') ?? '',
    })

    const computedBg = getComputedStyle(el).backgroundColor
    const backgroundColor = isTransparentBackground(computedBg) ? DEFAULT_MARK_BG : computedBg

    el.className = ''
    el.style.background = 'none'
    el.style.backgroundColor = 'transparent'
    el.innerHTML = splitHighlightSegments(text)
      .map((segment) => wrapHighlightSegment(segment, backgroundColor))
      .join('')
  }

  return () => {
    for (const snapshot of snapshots.reverse()) {
      snapshot.el.innerHTML = snapshot.innerHTML
      snapshot.el.className = snapshot.className
      if (snapshot.style) snapshot.el.setAttribute('style', snapshot.style)
      else snapshot.el.removeAttribute('style')
    }
  }
}

export async function exportPageAsPng(page: HTMLElement, index: number) {
  const wrap = page.closest('.page-wrap') as HTMLElement | null
  if (wrap) wrap.classList.add('is-exporting')
  const restoreHighlights = prepareInlineHighlightsForExport(page)
  try {
    const canvas = await html2canvas(page, {
      width: PAGE_W,
      height: PAGE_H,
      scale: EXPORT_SCALE,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    })
    const link = document.createElement('a')
    const num = page.getAttribute('data-page') || String(index + 1)
    link.download = `page-${num}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  } finally {
    restoreHighlights()
    if (wrap) wrap.classList.remove('is-exporting')
  }
}

export async function exportAllPagesAsPng(docRoot: HTMLElement) {
  const pages = getPages(docRoot)
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    if (page) await exportPageAsPng(page, i)
  }
  return pages.length
}
