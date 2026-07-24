/** 网站注入的溢出指示样式 / 裁切线；序列化前须由 cleanEditorArtifacts 剥离 */

export const OVERFLOW_STYLE_ID = '__atp_overflow_style__'
export const OVERFLOW_CUT_ATTR = 'data-atp-overflow-cut'
export const OVERFLOW_PAGE_CLASS = 'page--overflow'
export const OVERFLOW_BLOCK_CLASS = 'block--overflow'

const STYLE_TEXT = `
.page.${OVERFLOW_PAGE_CLASS} {
  outline: 4px solid #ef4444;
  outline-offset: 2px;
}
.${OVERFLOW_BLOCK_CLASS} {
  outline: 2px dashed #ef4444 !important;
  outline-offset: 4px;
}
.page > [${OVERFLOW_CUT_ATTR}] {
  position: absolute;
  left: 0;
  right: 0;
  top: var(--atp-canvas-h, 1440px);
  height: 0;
  border-top: 2px dashed #ef4444;
  pointer-events: none;
  z-index: 40;
}
.page-wrap.is-exporting .page.${OVERFLOW_PAGE_CLASS} {
  outline: none;
}
.page-wrap.is-exporting .${OVERFLOW_BLOCK_CLASS} {
  outline: none !important;
}
.page-wrap.is-exporting .page > [${OVERFLOW_CUT_ATTR}] {
  display: none !important;
}
`

export function ensureOverflowVisualStyles(doc: Document, pageHeight: number) {
  doc.documentElement.style.setProperty('--atp-canvas-h', `${pageHeight}px`)

  let style = doc.getElementById(OVERFLOW_STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = doc.createElement('style')
    style.id = OVERFLOW_STYLE_ID
    style.textContent = STYLE_TEXT
    doc.head.appendChild(style)
  }
}

export function syncOverflowCutLine(page: HTMLElement, overflow: boolean) {
  const doc = page.ownerDocument
  if (!doc) return

  let cut = page.querySelector(`[${OVERFLOW_CUT_ATTR}]`) as HTMLElement | null
  if (!overflow) {
    cut?.remove()
    return
  }
  if (!cut) {
    cut = doc.createElement('div')
    cut.setAttribute(OVERFLOW_CUT_ATTR, '')
    cut.setAttribute('aria-hidden', 'true')
    page.appendChild(cut)
  }
}

export function removeOverflowVisuals(root: ParentNode | Document | null | undefined) {
  if (!root) return

  const doc: Document | null =
    typeof (root as Document).documentElement !== 'undefined' && (root as Document).nodeType === 9
      ? (root as Document)
      : ((root as Node).ownerDocument ?? null)

  const scope: ParentNode = doc && root === doc ? (doc.body ?? doc) : root

  scope.querySelectorAll(`[${OVERFLOW_CUT_ATTR}]`).forEach((node) => node.remove())
  scope.querySelectorAll(`.${OVERFLOW_PAGE_CLASS}`).forEach((node) => {
    ;(node as HTMLElement).classList.remove(OVERFLOW_PAGE_CLASS)
  })
  scope.querySelectorAll(`.${OVERFLOW_BLOCK_CLASS}`).forEach((node) => {
    ;(node as HTMLElement).classList.remove(OVERFLOW_BLOCK_CLASS)
  })

  doc?.getElementById(OVERFLOW_STYLE_ID)?.remove()
  doc?.documentElement?.style.removeProperty('--atp-canvas-h')
}
