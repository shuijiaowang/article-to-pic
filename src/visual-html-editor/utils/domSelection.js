function isElementNode(node) {
  return Boolean(node && node.nodeType === 1)
}

function isHTMLElementNode(node) {
  return isElementNode(node) && typeof node.tagName === 'string'
}

export function getTextEditKind(el) {
  if (!isHTMLElementNode(el)) return ''
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea') return tag
  if (tag === 'script' || tag === 'style' || tag === 'noscript') return ''
  return 'innerHTML'
}

export function getElementLabel(el) {
  if (!isElementNode(el)) return ''
  const tag = el.tagName.toLowerCase()
  const dataId = el.getAttribute('data-id')
  if (dataId) return `${tag}[data-id=${dataId}]`
  if (el.getAttribute('data-page')) return `${tag}[data-page=${el.getAttribute('data-page')}]`
  const id = el.getAttribute('id')
  if (id) return `${tag}#${id}`
  const className = el.getAttribute('class') || ''
  const firstClass = className.split(/\s+/).filter(Boolean)[0]
  return firstClass ? `${tag}.${firstClass}` : tag
}

export function findSelectableElement(start, root) {
  let el = start
  while (isHTMLElementNode(el) && root?.contains(el)) {
    if (el !== root) return el
    el = el.parentElement
  }
  return null
}

export function pickTargetFromEvent(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  for (const node of path) {
    if (isElementNode(node)) return node
    if (node?.nodeType === 3 && node.parentElement) return node.parentElement
  }

  const node = event.target
  if (isElementNode(node)) return node
  return node?.parentElement ?? null
}

export function normalizePxNumberOrEmpty(pxText) {
  const value = String(pxText || '').trim()
  if (!value || value === 'normal') return ''
  const match = value.match(/^(-?\d+(?:\.\d+)?)px$/i)
  if (match) return match[1]
  return ''
}

export function normalizeTextDecoration(decorationValue) {
  const value = String(decorationValue || '').trim()
  if (!value || value === 'none') return ''
  const candidates = ['underline', 'line-through', 'overline']
  const found = candidates.find((c) => value.includes(c))
  return found || ''
}

export function normalizeHexColor(colorText, fallback) {
  const value = String(colorText || '').trim()
  if (!value) return fallback
  if (value.startsWith('#') && (value.length === 7 || value.length === 4)) return value
  const match = value.match(/\d+/g)
  if (!match || match.length < 3) return fallback
  const [r, g, b] = match.slice(0, 3).map((n) => Number(n))
  const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function setInlineStyle(el, prop, value) {
  if (!isHTMLElementNode(el)) return
  if (value === undefined || value === null || value === '') {
    el.style.removeProperty(prop)
    return
  }
  el.style.setProperty(prop, value, 'important')
}
