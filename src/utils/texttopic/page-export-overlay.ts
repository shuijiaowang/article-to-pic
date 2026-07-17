/** 注入到预览 iframe，序列化前须由 cleanEditorArtifacts 剥离 */
export const PAGE_EXPORT_STYLE_ID = '__atp_page_export_style__'
export const PAGE_EXPORT_BTN_ATTR = 'data-atp-page-export'
export const PAGE_EXPORT_BTN_CLASS = '__atp_page_export_btn'

const STYLE_TEXT = `
.page-wrap {
  position: relative;
}
.page-wrap > .${PAGE_EXPORT_BTN_CLASS} {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 50;
  transform: scale(calc(1 / var(--preview-scale, 0.38)));
  transform-origin: top right;
  margin: 0;
  padding: 10px 16px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.96);
  color: #0f172a;
  font: 600 14px/1.2 "PingFang SC", "Microsoft YaHei", sans-serif;
  letter-spacing: 0.02em;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease, background 0.15s ease, transform 0.15s ease;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}
.page-wrap:hover > .${PAGE_EXPORT_BTN_CLASS},
.page-wrap:focus-within > .${PAGE_EXPORT_BTN_CLASS},
.page-wrap > .${PAGE_EXPORT_BTN_CLASS}:focus {
  opacity: 1;
  pointer-events: auto;
}
.page-wrap > .${PAGE_EXPORT_BTN_CLASS}:hover {
  background: #fff;
}
.page-wrap > .${PAGE_EXPORT_BTN_CLASS}:active {
  transform: scale(calc(1 / var(--preview-scale, 0.38) * 0.98));
}
.page-wrap > .${PAGE_EXPORT_BTN_CLASS}:disabled {
  opacity: 0.55;
  cursor: wait;
  pointer-events: none;
}
@media (hover: none) {
  .page-wrap > .${PAGE_EXPORT_BTN_CLASS} {
    opacity: 0.95;
    pointer-events: auto;
  }
}
.page-wrap.is-exporting > .${PAGE_EXPORT_BTN_CLASS} {
  display: none !important;
}
body[data-vhe-editing] .${PAGE_EXPORT_BTN_CLASS} {
  display: none !important;
}
`

export type PageExportHandler = (page: HTMLElement, index: number) => void | Promise<void>

function ensureStyle(doc: Document) {
  if (doc.getElementById(PAGE_EXPORT_STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = PAGE_EXPORT_STYLE_ID
  style.textContent = STYLE_TEXT
  doc.head.appendChild(style)
}

export function removePageExportOverlays(root: ParentNode | Document | null | undefined) {
  if (!root) return

  const doc: Document | null =
    typeof (root as Document).documentElement !== 'undefined' && (root as Document).nodeType === 9
      ? (root as Document)
      : ((root as Node).ownerDocument ?? null)

  const scope: ParentNode =
    doc && root === doc ? (doc.body ?? doc) : root

  scope.querySelectorAll(`[${PAGE_EXPORT_BTN_ATTR}]`).forEach((node) => node.remove())
  doc?.getElementById(PAGE_EXPORT_STYLE_ID)?.remove()
}

export function mountPageExportOverlays(
  docRoot: HTMLElement,
  options: {
    onExport: PageExportHandler
    disabled?: boolean
  },
) {
  const doc = docRoot.ownerDocument
  if (!doc) return

  removePageExportOverlays(doc)
  ensureStyle(doc)

  const wraps = [...docRoot.querySelectorAll('.page-wrap')] as HTMLElement[]
  wraps.forEach((wrap, index) => {
    const page = wrap.querySelector('.page') as HTMLElement | null
    if (!page) return

    const pageNum = page.getAttribute('data-page') || String(index + 1)
    const btn = doc.createElement('button')
    btn.type = 'button'
    btn.className = PAGE_EXPORT_BTN_CLASS
    btn.setAttribute(PAGE_EXPORT_BTN_ATTR, pageNum)
    btn.textContent = `导出第 ${pageNum} 页`
    btn.title = `导出第 ${pageNum} 页为 PNG`
    btn.disabled = !!options.disabled

    btn.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (btn.disabled) return
      void options.onExport(page, index)
    })

    wrap.insertBefore(btn, wrap.firstChild)
  })
}

export function setPageExportOverlaysDisabled(docRoot: HTMLElement | null | undefined, disabled: boolean) {
  if (!docRoot) return
  docRoot.querySelectorAll<HTMLButtonElement>(`[${PAGE_EXPORT_BTN_ATTR}]`).forEach((btn) => {
    btn.disabled = disabled
  })
}
