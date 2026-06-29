import { editHtmlWithAgent } from '@/agents/html-editor-agent'
import { isAiReady } from '@/ai'
import type { AiHtmlEditResult } from '@/types/ai-patch'
import type { Article } from '@/types/document'
import { normalizeHtmlForApp } from '@/utils/normalize-html'
import templateHtml from '../../template/template.html?raw'

export function buildArticleHtmlRequest(article: Pick<Article, 'title' | 'content'>): string {
  return `请根据以下文稿，将当前 HTML 文件中 #doc 内的示例页面全部替换为根据文稿排版生成的新内容。

文稿标题：${article.title}

文稿正文：
${article.content}

要求：
1. 只修改 #doc 内的 .page-wrap / .page / .block，不要改 head、style、.toolbar、script
2. 第 1 页为封面 page--cover，正文从第 2 页开始
3. 每页画布 1080×1440px，内容过多时新开 .page
4. 每个 block 需 data-id，img 块只写 data-placeholder 不要 src
5. 封面可自由搭配 style，正文块遵循模板默认样式`
}

export async function generateHtmlFromArticle(
  article: Pick<Article, 'title' | 'content'>,
): Promise<AiHtmlEditResult> {
  if (!isAiReady()) {
    throw new Error('AI 未配置，请先在设置页填写 API 密钥')
  }

  const content = normalizeHtmlForApp(templateHtml)
  const request = buildArticleHtmlRequest(article)

  const result = await editHtmlWithAgent({
    fileName: 'template.html',
    content,
    request,
  })

  return {
    ...result,
    content: normalizeHtmlForApp(result.content),
  }
}
