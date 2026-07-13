import { nextTick, ref } from 'vue'
import { HISTORY_LIMIT } from '../constants/styleKeys.js'
import { sanitizeRestoreBodyHtml } from '../utils/htmlDocument.js'
import { debugLog, undoDebugLog, undoDebugStack } from '../utils/editorDom.js'

/**
 * Per-version undo/redo stack (body HTML snapshots).
 */
export function useVisualHtmlHistory(options = {}) {
  const {
    getCurrentBodyHtml,
    getDocRoot,
    onDirtyChange,
    onBeforeRestore,
    onAfterRestore,
  } = options

  const historyPast = ref([])
  const historyFuture = ref([])
  const historyCurrent = ref(null)
  /** 进入当前版本时的初始 body HTML，不随撤销栈裁剪而丢失 */
  const anchorBodyHtml = ref('')
  const isRestoringSnapshot = ref(false)

  function setAnchorBodyHtml(html) {
    anchorBodyHtml.value = String(html ?? '')
    undoDebugLog('anchor:set', { len: anchorBodyHtml.value.length })
  }

  /**
   * 当前版本的「初始态」：优先用锚点，其次用历史栈最早快照（兼容旧草稿）。
   */
  function getAnchorBodyHtml() {
    const anchored = String(anchorBodyHtml.value ?? '').trim()
    if (anchored) return anchorBodyHtml.value

    const past = historyPast.value
    if (past.length > 0 && past[0]?.bodyHtml != null) {
      return String(past[0].bodyHtml)
    }

    if (historyCurrent.value?.bodyHtml != null) {
      return String(historyCurrent.value.bodyHtml)
    }

    return ''
  }

  function ensureAnchorBodyHtml(fallbackHtml = '') {
    if (String(anchorBodyHtml.value ?? '').trim()) return
    const fallback = String(fallbackHtml ?? '').trim()
    if (fallback) {
      setAnchorBodyHtml(fallback)
      return
    }
    const resolved = getAnchorBodyHtml()
    if (resolved) {
      setAnchorBodyHtml(resolved)
    }
  }

  function makeSnapshot(reason = '') {
    return {
      t: Date.now(),
      reason,
      bodyHtml: getCurrentBodyHtml(),
    }
  }

  function snapshotsEqual(a, b) {
    if (!a || !b) return false
    return String(a.bodyHtml ?? '') === String(b.bodyHtml ?? '')
  }

  function pushHistorySnapshot(reason = '') {
    if (isRestoringSnapshot.value) {
      undoDebugLog('snapshot:blocked_restoring', { reason, isRestoringSnapshot: true })
      return
    }

    const snap = makeSnapshot(reason)
    if (historyCurrent.value && snapshotsEqual(historyCurrent.value, snap)) {
      debugLog('snapshot:skip_same', { reason, bodyLen: String(snap.bodyHtml ?? '').length })
      undoDebugLog('snapshot:skip_same', { reason, bodyLen: String(snap.bodyHtml ?? '').length })
      return
    }

    if (historyCurrent.value) historyPast.value.push(historyCurrent.value)
    historyCurrent.value = snap
    historyFuture.value = []

    if (historyPast.value.length > HISTORY_LIMIT) {
      const trimmed = historyPast.value.length - HISTORY_LIMIT
      historyPast.value.splice(0, trimmed)
      undoDebugLog('snapshot:trim_past', { trimmed, limit: HISTORY_LIMIT })
    }

    debugLog('snapshot:push', {
      reason,
      pastLen: historyPast.value.length,
      futureLen: historyFuture.value.length,
    })
    undoDebugStack('push', {
      past: historyPast.value,
      current: historyCurrent.value,
      future: historyFuture.value,
      anchor: anchorBodyHtml.value,
    })
    undoDebugLog('snapshot:push', { reason })
  }

  function requestSnapshot(reason = '') {
    if (isRestoringSnapshot.value) {
      undoDebugLog('requestSnapshot:blocked_restoring', { reason })
      return
    }
    pushHistorySnapshot(reason)
  }

  function resetHistoryStacks({ resetAnchor = false } = {}) {
    undoDebugLog('resetHistoryStacks', { resetAnchor })
    historyPast.value = []
    historyFuture.value = []
    historyCurrent.value = null
    if (resetAnchor) {
      anchorBodyHtml.value = ''
    }
    undoDebugStack('after_reset', {
      past: historyPast.value,
      current: historyCurrent.value,
      future: historyFuture.value,
      anchor: anchorBodyHtml.value,
    })
  }

  function captureHistoryState() {
    return {
      historyPast: historyPast.value,
      historyCurrent: historyCurrent.value,
      historyFuture: historyFuture.value,
      baselineBodyHtml: getAnchorBodyHtml(),
    }
  }

  function applyHistoryState(state) {
    undoDebugLog('applyHistoryState:begin', {
      hasState: Boolean(state),
      pastLen: state?.past?.length ?? 0,
      futureLen: state?.future?.length ?? 0,
      baselineLen: String(state?.baseline ?? '').length,
    })
    if (!state) {
      resetHistoryStacks()
      anchorBodyHtml.value = ''
      return
    }
    historyPast.value = Array.isArray(state.past) ? [...state.past] : []
    historyCurrent.value = state.current || null
    historyFuture.value = Array.isArray(state.future) ? [...state.future] : []
    setAnchorBodyHtml(String(state.baseline ?? ''))
    ensureAnchorBodyHtml()
    onDirtyChange?.()
    undoDebugStack('applyHistoryState', {
      past: historyPast.value,
      current: historyCurrent.value,
      future: historyFuture.value,
      anchor: anchorBodyHtml.value,
    })
  }

  async function restoreSnapshot(snapshot) {
    if (!snapshot) {
      undoDebugLog('restoreSnapshot:skip_null')
      return
    }
    undoDebugLog('restoreSnapshot:begin', {
      reason: snapshot.reason ?? '',
      snapshotT: snapshot.t ?? null,
      bodyLen: String(snapshot.bodyHtml ?? '').length,
      isRestoringBefore: isRestoringSnapshot.value,
    })
    isRestoringSnapshot.value = true
    try {
      await onBeforeRestore?.()
      const html = sanitizeRestoreBodyHtml(snapshot.bodyHtml)
      const docRoot = getDocRoot()
      undoDebugLog('restoreSnapshot:before_innerHTML', {
        hasDocRoot: Boolean(docRoot),
        docRootTag: docRoot?.tagName ?? null,
        docRootConnected: docRoot?.isConnected ?? null,
        rawHtmlLen: String(snapshot.bodyHtml ?? '').length,
        htmlLen: html.length,
        childCountBefore: docRoot?.children?.length ?? null,
      })
      if (docRoot) {
        docRoot.innerHTML = html
      } else {
        undoDebugLog('restoreSnapshot:no_docRoot', { warning: 'innerHTML not applied' })
      }
      await nextTick()
      undoDebugLog('restoreSnapshot:after_innerHTML', {
        childCountAfter: docRoot?.children?.length ?? null,
        liveBodyLen: String(getCurrentBodyHtml?.() ?? '').length,
      })
      await onAfterRestore?.()
      onDirtyChange?.()
      undoDebugLog('restoreSnapshot:done')
    } catch (err) {
      undoDebugLog('restoreSnapshot:error', { message: err?.message ?? String(err) })
      throw err
    } finally {
      setTimeout(() => {
        isRestoringSnapshot.value = false
        undoDebugLog('restoreSnapshot:isRestoringSnapshot_cleared')
      }, 0)
    }
  }

  async function undo() {
    undoDebugStack('undo:requested', {
      past: historyPast.value,
      current: historyCurrent.value,
      future: historyFuture.value,
      anchor: anchorBodyHtml.value,
    })
    if (!historyPast.value.length) {
      undoDebugLog('undo:noop_empty_past', {
        pastLen: 0,
        currentReason: historyCurrent.value?.reason ?? null,
        anchorLen: String(anchorBodyHtml.value ?? '').length,
      })
      return
    }
    if (!historyCurrent.value) historyCurrent.value = makeSnapshot('init')
    const prev = historyPast.value.pop()
    if (historyCurrent.value) historyFuture.value.unshift(historyCurrent.value)
    historyCurrent.value = prev
    undoDebugLog('undo:pop', {
      restoredReason: prev?.reason ?? '',
      restoredTLen: prev?.t ?? null,
      newPastLen: historyPast.value.length,
      newFutureLen: historyFuture.value.length,
    })
    undoDebugStack('undo:before_restore', {
      past: historyPast.value,
      current: historyCurrent.value,
      future: historyFuture.value,
      anchor: anchorBodyHtml.value,
    })
    await restoreSnapshot(prev)
    undoDebugStack('undo:after_restore', {
      past: historyPast.value,
      current: historyCurrent.value,
      future: historyFuture.value,
      anchor: anchorBodyHtml.value,
    })
  }

  async function redo() {
    undoDebugStack('redo:requested', {
      past: historyPast.value,
      current: historyCurrent.value,
      future: historyFuture.value,
      anchor: anchorBodyHtml.value,
    })
    if (!historyFuture.value.length) {
      undoDebugLog('redo:noop_empty_future')
      return
    }
    if (!historyCurrent.value) historyCurrent.value = makeSnapshot('init')
    const next = historyFuture.value.shift()
    if (historyCurrent.value) historyPast.value.push(historyCurrent.value)
    historyCurrent.value = next
    undoDebugLog('redo:shift', {
      restoredReason: next?.reason ?? '',
      newPastLen: historyPast.value.length,
      newFutureLen: historyFuture.value.length,
    })
    await restoreSnapshot(next)
    undoDebugStack('redo:after_restore', {
      past: historyPast.value,
      current: historyCurrent.value,
      future: historyFuture.value,
      anchor: anchorBodyHtml.value,
    })
  }

  return {
    historyPast,
    historyFuture,
    historyCurrent,
    anchorBodyHtml,
    isRestoringSnapshot,
    makeSnapshot,
    requestSnapshot,
    resetHistoryStacks,
    setAnchorBodyHtml,
    getAnchorBodyHtml,
    ensureAnchorBodyHtml,
    captureHistoryState,
    applyHistoryState,
    undo,
    redo,
  }
}
