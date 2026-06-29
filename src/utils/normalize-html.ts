/** 将模板 HTML 中的相对资源路径改为应用内可访问的绝对路径 */
export function normalizeHtmlForApp(html: string): string {
  return html
    .replace(/src="texttopic\.js"/g, 'src="/template/texttopic.js"')
    .replace(/src='texttopic\.js'/g, "src='/template/texttopic.js'")
}

export function downloadHtmlFile(html: string, fileName: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.endsWith('.html') ? fileName : `${fileName}.html`
  link.click()
  URL.revokeObjectURL(url)
}
