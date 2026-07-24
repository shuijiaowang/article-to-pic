import { stripPreviewScripts } from '../../utils/parse-html.ts'
import {
  OVERFLOW_BLOCK_CLASS,
  OVERFLOW_CUT_ATTR,
  OVERFLOW_PAGE_CLASS,
  OVERFLOW_STYLE_ID,
} from '../../utils/texttopic/overflow-visual.ts'

export const EDIT_GUIDE_STYLE_ID = '__vhe_edit_guide_style__'
export const OVERLAY_ROOT_ID = '__vhe_overlay_root__'
export const OVERLAY_STYLE_ID = '__vhe_overlay_style__'
/** Article to Pic 预览页「导出此页」按钮，序列化前须剥离 */
export const PAGE_EXPORT_STYLE_ID = '__atp_page_export_style__'
export const PAGE_EXPORT_BTN_ATTR = 'data-atp-page-export'
export {
  OVERFLOW_STYLE_ID,
  OVERFLOW_CUT_ATTR,
  OVERFLOW_PAGE_CLASS,
  OVERFLOW_BLOCK_CLASS,
}

export function parseHtmlForEdit(html) {
  const documentHtml = String(html || '')
  return {
    sourceHtml: documentHtml,
    documentHtml,
  }
}

/** 从 body 克隆并剥离 overlay、选区描边等编辑器痕迹，得到可对比的 innerHTML */
export function sanitizeBodyInnerHtml(body) {
  if (!body?.cloneNode) return ''
  const clone = body.cloneNode(true)
  if (!(clone instanceof HTMLElement)) return String(body.innerHTML ?? '')
  clone.querySelectorAll(`#${OVERLAY_ROOT_ID}`).forEach((node) => node.remove())
  clone.querySelectorAll(`[${PAGE_EXPORT_BTN_ATTR}]`).forEach((node) => node.remove())
  clone.querySelectorAll(`[${OVERFLOW_CUT_ATTR}]`).forEach((node) => node.remove())
  clone.querySelectorAll('*').forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    node.classList.remove(OVERFLOW_PAGE_CLASS, OVERFLOW_BLOCK_CLASS)
    node.style.outline = ''
    node.style.outlineOffset = ''
  })
  return String(clone.innerHTML ?? '')
}

/** 从 body innerHTML 字符串中剥离编辑器注入节点，供撤销/重做恢复前使用 */
export function sanitizeRestoreBodyHtml(html) {
  const raw = String(html ?? '')
  if (!raw.trim()) return ''

  const doc = document.implementation.createHTMLDocument('')
  doc.body.innerHTML = raw
  cleanEditorArtifacts(doc)
  return String(doc.body.innerHTML ?? '')
}

/** 移除编辑器注入的 DOM（overlay、选区描边、编辑引导样式等），避免序列化进 HTML 后丢失事件绑定 */
export function cleanEditorArtifacts(doc) {
  if (!doc) return

  doc.getElementById(OVERLAY_ROOT_ID)?.remove()
  doc.getElementById(OVERLAY_STYLE_ID)?.remove()
  doc.getElementById(EDIT_GUIDE_STYLE_ID)?.remove()
  doc.getElementById(PAGE_EXPORT_STYLE_ID)?.remove()
  doc.getElementById(OVERFLOW_STYLE_ID)?.remove()
  doc.documentElement?.style?.removeProperty?.('--atp-canvas-h')
  doc.body?.removeAttribute('data-vhe-editing')
  doc.querySelectorAll?.(`[${PAGE_EXPORT_BTN_ATTR}]`).forEach((node) => node.remove())
  doc.querySelectorAll?.(`[${OVERFLOW_CUT_ATTR}]`).forEach((node) => node.remove())

  doc.body?.querySelectorAll('*').forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    node.classList.remove(OVERFLOW_PAGE_CLASS, OVERFLOW_BLOCK_CLASS)
    node.style.outline = ''
    node.style.outlineOffset = ''
    node.removeAttribute('data-vhe-bound')
  })
}

/**
 * 将运行时 computed 的隐藏状态冻结为 inline style，便于捕获当前可见页（如 A/B 页中的 B 页）。
 */
export function freezeLiveDocumentVisibility(doc) {
  const win = doc?.defaultView
  const body = doc?.body
  if (!win || !body) return

  const nodes = [body, ...body.querySelectorAll('*')]
  nodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    const style = win.getComputedStyle(node)
    if (style.display === 'none') {
      node.style.setProperty('display', 'none', 'important')
    }
    if (style.visibility === 'hidden') {
      node.style.setProperty('visibility', 'hidden', 'important')
    }
  })
}

/** 从 document 序列化 HTML，不修改 live DOM（供草稿持久化等后台快照使用） */
export function serializeDocumentHtml(doc) {
  if (!doc?.documentElement) return ''

  const parsed = new DOMParser().parseFromString(doc.documentElement.outerHTML, 'text/html')
  cleanEditorArtifacts(parsed)

  const doctype = doc.doctype
  let doctypeStr = '<!DOCTYPE html>'
  if (doctype) {
    doctypeStr = `<!DOCTYPE ${doctype.name}`
    if (doctype.publicId) {
      doctypeStr += ` PUBLIC "${doctype.publicId}"`
      if (doctype.systemId) doctypeStr += ` "${doctype.systemId}"`
    } else if (doctype.systemId) {
      doctypeStr += ` SYSTEM "${doctype.systemId}"`
    }
    doctypeStr += '>'
  }

  return stripPreviewScripts(`${doctypeStr}\n${parsed.documentElement.outerHTML}`)
}

/** 从 iframe 的 document 捕获完整 HTML（含 head/link/style/script、当前页可见状态） */
export function captureLiveDocumentHtml(doc) {
  if (!doc?.documentElement) return ''

  freezeLiveDocumentVisibility(doc)
  cleanEditorArtifacts(doc)

  const doctype = doc.doctype
  let doctypeStr = '<!DOCTYPE html>'
  if (doctype) {
    doctypeStr = `<!DOCTYPE ${doctype.name}`
    if (doctype.publicId) {
      doctypeStr += ` PUBLIC "${doctype.publicId}"`
      if (doctype.systemId) doctypeStr += ` "${doctype.systemId}"`
    } else if (doctype.systemId) {
      doctypeStr += ` SYSTEM "${doctype.systemId}"`
    }
    doctypeStr += '>'
  }

  return stripPreviewScripts(`${doctypeStr}\n${doc.documentElement.outerHTML}`)
}
