import { snapdom } from '@zumer/snapdom'
import { EXPORT_SCALE, PAGE_H, PAGE_W } from '@/utils/texttopic/constants'
import { getPages } from '@/utils/texttopic/layout-report'

const SNAPDOM_CAPTURE_OPTIONS = {
  scale: EXPORT_SCALE,
  width: PAGE_W,
  height: PAGE_H,
  backgroundColor: '#ffffff',
} as const

export async function exportPageAsPng(page: HTMLElement, index: number) {
  const wrap = page.closest('.page-wrap') as HTMLElement | null
  if (wrap) wrap.classList.add('is-exporting')
  try {
    const num = page.getAttribute('data-page') || String(index + 1)
    await snapdom.download(page, {
      ...SNAPDOM_CAPTURE_OPTIONS,
      format: 'png',
      filename: `page-${num}.png`,
    })
  } finally {
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
