/** 从 TextToPic HTML 中提取样式与 #doc 内容 */
export function parseTextToPicHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const docNode = doc.getElementById('doc')
  if (!docNode) {
    throw new Error('未找到 #doc，请确认是 TextToPic 模板 HTML')
  }

  const styles = [...doc.querySelectorAll('style')]
    .map((s) => s.textContent ?? '')
    .join('\n')
    .replace(/body\s*\{[^}]*\}/g, '/* body styles omitted in preview */')

  return {
    docInnerHtml: docNode.innerHTML,
    styles,
  }
}

/** 将 #doc 的最新 innerHTML 写回完整 HTML 字符串 */
export function updateDocInHtml(html: string, docInnerHtml: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const docNode = doc.getElementById('doc')
  if (!docNode) return html

  docNode.innerHTML = docInnerHtml
  const doctype = html.match(/<!DOCTYPE[^>]*>/i)?.[0] ?? '<!DOCTYPE html>'
  return `${doctype}\n${doc.documentElement.outerHTML}`
}

/** 移除 Vue 应用已接管的 UI 壳（工具栏、报告面板、图片 input 等） */
export function stripAppChromeFromHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelector('.toolbar')?.remove()
  doc.getElementById('report-panel')?.remove()
  doc.getElementById('img-input')?.remove()
  const doctype = html.match(/<!DOCTYPE[^>]*>/i)?.[0] ?? '<!DOCTYPE html>'
  return `${doctype}\n${doc.documentElement.outerHTML}`
}

/** 移除预览用脚本（网站内已内化，导出 HTML 不再需要） */
export function stripPreviewScripts(html: string): string {
  return html
    .replace(/<script[^>]*src="[^"]*html2canvas[^"]*"[^>]*>\s*<\/script>\s*/gi, '')
    .replace(/<script[^>]*src="[^"]*texttopic[^"]*"[^>]*>\s*<\/script>\s*/gi, '')
}
