export const SELECTION_OUTLINE = '2px dashed #7c3aed'

const DEBUG_EDITOR = import.meta.env?.DEV ?? false

export function isHTMLElementNode(node) {
  return Boolean(node && node.nodeType === 1 && typeof node.tagName === 'string')
}

export function getElementWindow(el) {
  return el?.ownerDocument?.defaultView || window
}

export function getElementComputedStyle(el) {
  const view = getElementWindow(el)
  return view.getComputedStyle(el)
}

export function normalizeNumberOrEmpty(valueText) {
  const value = String(valueText || '').trim()
  if (!value || value === 'auto' || value === 'normal') return ''
  const num = Number.parseFloat(value)
  return Number.isFinite(num) ? num : ''
}

export function readPxNumber(styleValue) {
  const v = String(styleValue || '').trim()
  if (!v) return 0
  const m = v.match(/^(-?\d+(?:\.\d+)?)px$/i)
  if (m) return Number(m[1])
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

export function clampNumber(n, min, max) {
  const v = Number(n)
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

export function debugLog(message, meta) {
  if (!DEBUG_EDITOR) return
  // eslint-disable-next-line no-console
  console.debug(`[VisualHtmlEditor] ${message}`, meta ?? '')
}

/** Ctrl+Z / 撤销诊断：localStorage.setItem('vhe:undo-debug','1') 开启；DEV 下默认开启 */
export function isUndoDebugEnabled() {
  if (typeof localStorage !== 'undefined') {
    try {
      if (localStorage.getItem('vhe:undo-debug') === '1') return true
      if (localStorage.getItem('vhe:undo-debug') === '0') return false
    } catch {
      // ignore
    }
  }
  return DEBUG_EDITOR
}

function summarizeHtml(html) {
  const s = String(html ?? '')
  return { len: s.length, head: s.slice(0, 80), tail: s.slice(-40) }
}

function summarizeSnapshot(snap) {
  if (!snap) return null
  return {
    reason: snap.reason ?? '',
    t: snap.t ?? null,
    bodyHtml: summarizeHtml(snap.bodyHtml),
  }
}

export function undoDebugLog(event, meta = {}) {
  if (!isUndoDebugEnabled()) return
  const payload = { event, ts: Date.now(), ...meta }
  // eslint-disable-next-line no-console
  console.log('[VHE:undo]', payload)
  return payload
}

export function undoDebugStack(label, stacks) {
  if (!isUndoDebugEnabled()) return
  const { past = [], current = null, future = [], anchor = '' } = stacks
  undoDebugLog(`stack:${label}`, {
    pastLen: past.length,
    futureLen: future.length,
    past: past.map(summarizeSnapshot),
    current: summarizeSnapshot(current),
    future: future.map(summarizeSnapshot),
    anchor: summarizeHtml(anchor),
    anchorEqualsCurrent: String(anchor ?? '') === String(current?.bodyHtml ?? ''),
  })
}

export function undoDebugDom(label, ctx = {}) {
  if (!isUndoDebugEnabled()) return
  undoDebugLog(`dom:${label}`, ctx)
}
