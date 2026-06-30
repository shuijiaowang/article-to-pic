import { parseTextToPicHtml, stripPreviewScripts, stripAppChromeFromHtml } from '@/utils/parse-html'

/** 从 AI 回复中提取 HTML（去掉 markdown 围栏与前后说明文字） */
export function extractHtmlFromAiResponse(raw: string): string {
  let text = raw.trim()
  if (!text) {
    throw new Error('AI 未返回内容')
  }

  const fenceMatch = text.match(/```(?:html)?\s*\n([\s\S]*?)```/i)
  if (fenceMatch?.[1]) {
    text = fenceMatch[1].trim()
  }

  const doctypeIdx = text.search(/<!DOCTYPE\s+html/i)
  const htmlIdx = text.search(/<html[\s>/]/i)
  const start =
    doctypeIdx >= 0 ? doctypeIdx : htmlIdx >= 0 ? htmlIdx : text.indexOf('<')

  if (start > 0) {
    text = text.slice(start)
  } else if (start < 0) {
    throw new Error('AI 回复中未找到 HTML 文档')
  }

  const lastHtmlClose = text.lastIndexOf('</html>')
  if (lastHtmlClose >= 0) {
    text = text.slice(0, lastHtmlClose + '</html>'.length)
  }

  return text.trim()
}

/** 校验并规范化 AI 生成的完整 HTML */
export function normalizeGeneratedHtml(html: string): string {
  const cleaned = stripAppChromeFromHtml(stripPreviewScripts(html.trim()))
  if (!cleaned) {
    throw new Error('HTML 内容为空')
  }

  parseTextToPicHtml(cleaned)

  const doc = new DOMParser().parseFromString(cleaned, 'text/html')
  if (!doc.getElementById('doc')?.querySelector('.page')) {
    throw new Error('HTML 缺少 #doc 或 .page 结构')
  }

  return cleaned
}
