export function validateFullHTMLStructure(htmlContent) {
  const s = String(htmlContent ?? '').trim()
  if (!s) {
    return { ok: false, message: 'HTML内容不能为空' }
  }
  const lower = s.toLowerCase()
  if (
    !lower.includes('<html')
    || !lower.includes('</html>')
    || !lower.includes('<head')
    || !lower.includes('</head>')
    || !lower.includes('<body')
    || !lower.includes('</body>')
  ) {
    return {
      ok: false,
      message:
        'HTML必须为完整文档结构，需同时包含 <html>、<head>、<body> 及对应的闭合标签 </html>、</head>、</body>',
    }
  }
  return { ok: true }
}
