import { ref, toValue, type MaybeRefOrGetter } from 'vue'
import { isAiReady } from '@/ai'
import { fixLayoutWithAi } from '@/services/ai-html'
import { generateLayoutReport } from '@/utils/texttopic/layout-report'
import type { HtmlAiChatHtmlUpdatedPayload } from '../types'

function formatVersionLabel(prefix: string) {
  const time = new Date().toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${prefix} ${time}`
}

export interface UseHtmlAiLayoutFixOptions {
  getHtml: () => string
  getDocElement: () => HTMLElement | null
  getFileName: () => string
  blocked?: MaybeRefOrGetter<boolean>
  onAiNotConfigured?: () => void
  onStatus?: (message: string, warn?: boolean) => void
  onError?: (message: string) => void
  onHtmlUpdated?: (payload: HtmlAiChatHtmlUpdatedPayload) => void
}

export function useHtmlAiLayoutFix(options: UseHtmlAiLayoutFixOptions) {
  const optimizing = ref(false)

  async function runLayoutFix() {
    const doc = options.getDocElement()
    const html = options.getHtml()
    if (!doc || !html || optimizing.value || toValue(options.blocked ?? false)) return

    if (!isAiReady()) {
      options.onAiNotConfigured?.()
      return
    }

    optimizing.value = true
    options.onError?.('')
    options.onStatus?.('正在分析布局并请求 AI 调整…', false)

    try {
      const report = generateLayoutReport(doc, doc.ownerDocument.documentElement)
      const result = await fixLayoutWithAi({
        fileName: options.getFileName(),
        content: html,
        report,
      })

      if (!result.changed) {
        options.onStatus?.(result.summary || 'AI 认为当前布局无需调整', report.overflowPageCount > 0)
        return
      }

      options.onHtmlUpdated?.({
        content: result.content,
        summary: result.summary,
        label: formatVersionLabel('布局优化'),
      })
      options.onStatus?.(`AI 布局优化完成：${result.summary}`, false)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      options.onError?.(message)
      options.onStatus?.(message, true)
    } finally {
      optimizing.value = false
    }
  }

  return {
    optimizing,
    runLayoutFix,
  }
}
