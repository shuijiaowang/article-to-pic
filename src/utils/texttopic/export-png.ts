import html2canvas from 'html2canvas'
import { PAGE_H, PAGE_W } from '@/utils/texttopic/constants'
import { getPages } from '@/utils/texttopic/layout-report'

export async function exportPageAsPng(page: HTMLElement, index: number) {
  const wrap = page.closest('.page-wrap') as HTMLElement | null
  if (wrap) wrap.classList.add('is-exporting')
  try {
    const canvas = await html2canvas(page, {
      width: PAGE_W,
      height: PAGE_H,
      scale: 1,
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
