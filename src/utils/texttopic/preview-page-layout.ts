import { updatePreviewLayout } from '@/utils/texttopic/layout-report'

let layoutObserver: ResizeObserver | null = null

export function teardownPreviewPageLayout() {
  layoutObserver?.disconnect()
  layoutObserver = null
}

/** .page-wrap 使用 scale 预览时须收拢占位，否则页与页之间会出现大块空白 */
export function bindPreviewPageLayout(doc: Document) {
  const docRoot = doc.getElementById('doc')
  if (!docRoot) return

  teardownPreviewPageLayout()

  const apply = () => updatePreviewLayout(docRoot, doc.documentElement)
  apply()

  if (typeof ResizeObserver === 'undefined') return

  layoutObserver = new ResizeObserver(apply)
  layoutObserver.observe(docRoot)
  docRoot.querySelectorAll('.page-wrap').forEach((wrap) => {
    layoutObserver!.observe(wrap)
  })
}
