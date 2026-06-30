import { nextTick, ref, shallowRef, watch, type Ref } from 'vue'
import { resolveAssetsInDoc } from '@/utils/article-asset-html'
import { exportAllPagesAsPng } from '@/utils/texttopic/export-png'
import {
  generateLayoutReport,
  markOverflowVisual,
  updatePreviewLayout,
} from '@/utils/texttopic/layout-report'
import { EXPORT_H, EXPORT_W } from '@/utils/texttopic/constants'
import type { LayoutReport } from '@/utils/texttopic/types'

export function useTextToPicPreview(options: {
  docRef: Ref<HTMLElement | null>
  canvasRef: Ref<HTMLElement | null>
  imgInputRef: Ref<HTMLInputElement | null>
  onDocChanged?: (docInnerHtml: string) => void
}) {
  const status = ref('')
  const statusWarn = ref(false)
  const showReport = ref(false)
  const reportText = ref('')
  const exporting = ref(false)
  const lastReport = shallowRef<LayoutReport | null>(null)
  let pendingImgBlock: HTMLElement | null = null

  function setStatus(msg: string, isWarn = false) {
    status.value = msg
    statusWarn.value = isWarn
  }

  function getDocInnerHtml() {
    return options.docRef.value?.innerHTML ?? ''
  }

  function notifyDocChanged() {
    options.onDocChanged?.(getDocInnerHtml())
  }

  function ensureImgPlaceholders() {
    const doc = options.docRef.value
    if (!doc) return

    doc.querySelectorAll('.block.img').forEach((block) => {
      const el = block as HTMLElement
      if (el.querySelector('img')) return
      if (el.querySelector('.placeholder-hint')) return
      const hint = document.createElement('span')
      hint.className = 'placeholder-hint'
      hint.textContent = el.getAttribute('data-placeholder') || '点击上传图片'
      el.appendChild(hint)
    })
  }

  function bindImgBlocks() {
    const doc = options.docRef.value
    const input = options.imgInputRef.value
    if (!doc || !input) return

    doc.querySelectorAll('.block.img').forEach((block) => {
      const el = block as HTMLElement
      const img = el.querySelector('img')
      if (img?.getAttribute('src')) {
        el.onclick = null
        return
      }
      el.onclick = () => {
        pendingImgBlock = el
        input.click()
      }
    })
  }

  function onImgInputChange() {
    const input = options.imgInputRef.value
    const doc = options.docRef.value
    if (!input || !doc) return

    const file = input.files?.[0]
    input.value = ''
    if (!file || !pendingImgBlock) return

    const reader = new FileReader()
    reader.onload = () => {
      if (!pendingImgBlock) return
      pendingImgBlock.innerHTML = ''
      const img = document.createElement('img')
      img.src = reader.result as string
      img.alt = pendingImgBlock.getAttribute('data-placeholder') || ''
      pendingImgBlock.appendChild(img)
      pendingImgBlock = null
      setStatus('图片已嵌入，已同步到 HTML 缓存')
      markOverflowVisual(doc, options.canvasRef.value ?? undefined)
      notifyDocChanged()
    }
    reader.readAsDataURL(file)
  }

  async function refreshPreview() {
    const doc = options.docRef.value
    if (!doc) return
    await resolveAssetsInDoc(doc)
    ensureImgPlaceholders()
    bindImgBlocks()
    markOverflowVisual(doc, options.canvasRef.value ?? undefined)
  }

  async function showLayoutReport() {
    const doc = options.docRef.value
    if (!doc) return

    const report = generateLayoutReport(doc, options.canvasRef.value ?? undefined)
    lastReport.value = report
    reportText.value = JSON.stringify(report, null, 2)
    showReport.value = true

    if (report.overflowPageCount === 0) {
      setStatus('布局报告已生成：无溢出，可复制发给 AI 核对')
    } else {
      setStatus(`布局报告已生成：${report.overflowPageCount} 页溢出，请复制 JSON 发给 AI 调整`, true)
    }
  }

  async function copyReport() {
    if (!reportText.value) return
    try {
      await navigator.clipboard.writeText(reportText.value)
      setStatus('报告已复制到剪贴板')
    } catch {
      setStatus('复制失败，请手动选择复制')
    }
  }

  async function exportAll() {
    const doc = options.docRef.value
    if (!doc || exporting.value) return

    exporting.value = true
    setStatus('导出中…')
    try {
      const count = await exportAllPagesAsPng(doc)
      setStatus(`已导出 ${count} 页（每页 ${EXPORT_W}×${EXPORT_H}，超出部分不进入 PNG）`)
    } finally {
      exporting.value = false
    }
  }

  function closeReport() {
    showReport.value = false
  }

  function handleImgInputChange() {
    onImgInputChange()
  }

  watch(
    () => options.docRef.value,
    async (doc) => {
      if (!doc) return
      await nextTick()
      refreshPreview()
    },
  )

  return {
    status,
    statusWarn,
    showReport,
    reportText,
    exporting,
    lastReport,
    refreshPreview,
    showLayoutReport,
    copyReport,
    exportAll,
    closeReport,
    handleImgInputChange,
    updatePreviewLayout: () => {
      const doc = options.docRef.value
      if (doc) updatePreviewLayout(doc, options.canvasRef.value ?? undefined)
    },
  }
}
