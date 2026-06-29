/** 下载 HTML 文件 */
export function downloadHtmlFile(html: string, fileName: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.endsWith('.html') ? fileName : `${fileName}.html`
  link.click()
  URL.revokeObjectURL(url)
}
