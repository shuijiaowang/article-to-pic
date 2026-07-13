import { getElementLabel, getTextEditKind } from './domSelection.js'
import { OVERLAY_ROOT_ID } from './htmlDocument.js'

const IGNORE_TAGS = new Set(['script', 'style', 'noscript', 'link', 'meta', 'title'])
const EDITOR_STYLE_PROPS = new Set(['outline', 'outline-offset'])

function shouldSkipElement(el) {
  if (!el || el.nodeType !== 1) return true
  const tag = el.tagName.toLowerCase()
  if (IGNORE_TAGS.has(tag)) return true
  if (el.id === OVERLAY_ROOT_ID) return true
  return false
}

export function getDomPath(el, root) {
  const segments = []
  let node = el
  while (node && node !== root && node.parentElement) {
    const parent = node.parentElement
    const index = Array.from(parent.children).indexOf(node) + 1
    segments.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`)
    node = parent
  }
  return segments.join(' > ')
}

function findElementByPath(root, path) {
  if (!root || !path) return null
  const segments = path.split(' > ')
  let el = root
  for (const seg of segments) {
    const match = seg.match(/^([\w-]+):nth-child\((\d+)\)$/)
    if (!match) return null
    const tag = match[1]
    const nth = Number(match[2])
    const child = Array.from(el.children)[nth - 1] || null
    if (!child || child.tagName.toLowerCase() !== tag) return null
    el = child
  }
  return el
}

function parseInlineStyleMap(el) {
  const map = {}
  if (!el?.getAttribute) return map
  const style = el.getAttribute('style') || ''
  style.split(';').forEach((chunk) => {
    const trimmed = chunk.trim()
    if (!trimmed) return
    const colon = trimmed.indexOf(':')
    if (colon < 0) return
    const prop = trimmed.slice(0, colon).trim().toLowerCase()
    const val = trimmed.slice(colon + 1).trim()
    if (!prop || EDITOR_STYLE_PROPS.has(prop)) return
    map[prop] = val
  })
  return map
}

function diffStyleMaps(before, after) {
  const changes = []
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const prop of allKeys) {
    const prev = before[prop]
    const next = after[prop]
    if (prev === next) continue
    if (!prev && next) changes.push({ kind: 'add', property: prop, after: next })
    else if (prev && !next) changes.push({ kind: 'remove', property: prop, before: prev })
    else changes.push({ kind: 'change', property: prop, before: prev, after: next })
  }
  return changes
}

function hasElementChildren(el) {
  return Array.from(el.children).some((child) => child.nodeType === 1 && !shouldSkipElement(child))
}

function compareAttributes(baselineEl, currentEl) {
  const changes = []

  const baselinePlaceholder = baselineEl.getAttribute('placeholder') || ''
  const currentPlaceholder = currentEl.getAttribute('placeholder') || ''
  if (baselinePlaceholder !== currentPlaceholder) {
    changes.push({
      kind: 'attribute',
      name: 'placeholder',
      before: baselinePlaceholder || null,
      after: currentPlaceholder || null,
    })
  }

  const kind = getTextEditKind(currentEl)
  if (kind === 'innerHTML') {
    if (!hasElementChildren(currentEl)) {
      const baselineHtml = baselineEl.innerHTML
      const currentHtml = currentEl.innerHTML
      if (baselineHtml !== currentHtml) {
        changes.push({
          kind: 'content',
          name: 'innerHTML',
          before: baselineHtml,
          after: currentHtml,
        })
      }
    }
  } else if (kind === 'input' || kind === 'textarea') {
    const baselineValue = baselineEl.getAttribute('value') || baselineEl.value || ''
    const currentValue = currentEl.value || ''
    if (String(baselineValue) !== String(currentValue)) {
      changes.push({
        kind: 'content',
        name: 'value',
        before: String(baselineValue ?? ''),
        after: String(currentValue ?? ''),
      })
    }
  }

  return changes
}

function createBaselineBody(currentBody, baselineBodyHtml) {
  const ownerDoc = currentBody?.ownerDocument
  const parser = ownerDoc?.implementation?.createHTMLDocument?.('')
    || document.implementation.createHTMLDocument('')
  parser.body.innerHTML = String(baselineBodyHtml ?? '')
  return parser.body
}

/**
 * 对比当前 iframe body 与进入编辑器时的基线 HTML，收集内联样式与内容变更。
 * @param {string} [currentBodyHtml] 已剥离 overlay/选区描边的 body innerHTML；未传时直接遍历 live body
 */
export function buildEditChangeLog(currentBody, baselineBodyHtml, currentBodyHtml = null) {
  if (!currentBody) return []

  const baselineBody = createBaselineBody(currentBody, baselineBodyHtml)
  const compareBody = currentBodyHtml != null
    ? createBaselineBody(currentBody, currentBodyHtml)
    : currentBody
  const entries = []

  function walk(currentEl) {
    if (shouldSkipElement(currentEl)) return

    const path = getDomPath(currentEl, compareBody)
    const baselineEl = findElementByPath(baselineBody, path)
    if (!baselineEl) {
      Array.from(currentEl.children).forEach(walk)
      return
    }

    const styleChanges = diffStyleMaps(
      parseInlineStyleMap(baselineEl),
      parseInlineStyleMap(currentEl),
    )
    const attributeChanges = compareAttributes(baselineEl, currentEl)

    if (styleChanges.length || attributeChanges.length) {
      entries.push({
        label: getElementLabel(currentEl),
        path,
        tag: currentEl.tagName.toLowerCase(),
        id: currentEl.id || null,
        classes: (currentEl.getAttribute('class') || '').split(/\s+/).filter(Boolean),
        dataId: currentEl.getAttribute('data-id') || null,
        styleChanges,
        attributeChanges,
      })
    }

    Array.from(currentEl.children).forEach(walk)
  }

  Array.from(compareBody.children).forEach(walk)
  return entries
}

/** 格式化为适合粘贴给 AI 的 Markdown 文本 */
export function formatEditChangeLogForAi(entries) {
  if (!entries?.length) {
    return '（本轮可视化编辑暂无检测到相对初始内容的修改记录）'
  }

  const lines = [
    '# 可视化编辑 · 修改记录',
    '',
    '以下为相对「进入当前版本时」HTML 的变更。请根据元素标识与路径，将内联样式整理为合适的 CSS 选择器规则（写入 `<style>` 或 class），并移除对应元素上的 inline style。',
    '',
  ]

  entries.forEach((entry, index) => {
    lines.push(`## ${index + 1}. ${entry.label}`)
    lines.push(`- 标签: \`${entry.tag}\``)
    if (entry.id) lines.push(`- id: \`${entry.id}\``)
    if (entry.dataId) lines.push(`- data-id: \`${entry.dataId}\``)
    if (entry.classes?.length) lines.push(`- class: \`${entry.classes.join(' ')}\``)
    lines.push(`- DOM 路径: \`${entry.path}\``)

    if (entry.styleChanges?.length) {
      lines.push('- 内联样式变更:')
      for (const change of entry.styleChanges) {
        if (change.kind === 'add') {
          lines.push(`  - \`${change.property}\`: → \`${change.after}\`（新增）`)
        } else if (change.kind === 'remove') {
          lines.push(`  - \`${change.property}\`: \`${change.before}\` → 移除`)
        } else {
          lines.push(`  - \`${change.property}\`: \`${change.before || '(无)'}\` → \`${change.after}\``)
        }
      }
    }

    if (entry.attributeChanges?.length) {
      lines.push('- 属性/内容变更:')
      for (const change of entry.attributeChanges) {
        if (change.kind === 'content') {
          lines.push(`  - ${change.name}:`)
          lines.push(`    - 原: \`${change.before || '(空)'}\``)
          lines.push(`    - 现: \`${change.after || '(空)'}\``)
        } else {
          lines.push(`  - ${change.name}: \`${change.before || '(无)'}\` → \`${change.after || '(无)'}\``)
        }
      }
    }
    lines.push('')
  })

  lines.push('---')
  lines.push('请输出：① 建议的 CSS 规则块；② 需要从 HTML 中移除的 inline style 清单。')

  return lines.join('\n')
}
