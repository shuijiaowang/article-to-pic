import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  captureLiveDocumentHtml,
  serializeDocumentHtml,
  parseHtmlForEdit,
  sanitizeBodyInnerHtml,
} from '../utils/htmlDocument.js'
import { buildEditChangeLog, formatEditChangeLogForAi } from '../utils/editChangeLog.js'
import { debugLog, isHTMLElementNode, undoDebugDom, undoDebugLog, undoDebugStack, isUndoDebugEnabled } from '../utils/editorDom.js'
import { useVisualHtmlVersionManager } from './useVisualHtmlVersionManager.js'
import { useVisualHtmlHistory } from './useVisualHtmlHistory.js'
import { useVisualHtmlStyleForm } from './useVisualHtmlStyleForm.js'
import { useVisualHtmlOverlay } from './useVisualHtmlOverlay.js'
import { useVisualHtmlFrame } from './useVisualHtmlFrame.js'

export function useVisualHtmlEditor(options = {}) {
  const enableVersions = options.enableVersions !== false
  const versionManager = useVisualHtmlVersionManager()

  const sourceHtml = ref('')
  const documentHtml = ref('')
  const dirty = ref(false)
  const statusText = ref('点击页面元素进行编辑')
  const interactionEnabled = ref(true)

  /** Deferred refs to break circular composable dependencies */
  let overlayApi = null
  let styleFormApi = null

  function getCurrentBodyHtml() {
    const body = frame.docRootRef.value
    if (isHTMLElementNode(body)) {
      return sanitizeBodyInnerHtml(body)
    }
    const doc = frame.frameDocumentRef.value
    if (doc?.body) return sanitizeBodyInnerHtml(doc.body)
    return ''
  }

  function updateDirtyFlagFromDom() {
    const current = getCurrentBodyHtml()
    const anchor = String(history.getAnchorBodyHtml() ?? '')
    const nextDirty = current !== anchor
    dirty.value = nextDirty
    undoDebugLog('dirty:update', {
      dirty: nextDirty,
      currentLen: current.length,
      anchorLen: anchor.length,
      equal: current === anchor,
    })
  }

  function setEditGuidesForMode() {
    frame.setEditGuidesEnabled(interactionEnabled.value)
  }

  function shouldIgnoreUndoHotkey(target) {
    const el = isHTMLElementNode(target) ? target : null
    if (!el) return false
    const tag = el.tagName?.toLowerCase?.() || ''
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
    if (el.isContentEditable) return true
    return false
  }

  function handleGlobalKeydown(e) {
    const key = String(e.key || '').toLowerCase()
    const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '')
    const mod = isMac ? e.metaKey : e.ctrlKey
    const isUndo = mod && key === 'z' && !e.shiftKey
    const isRedo = mod && (key === 'y' || (key === 'z' && e.shiftKey))

    if (isUndo || isRedo) {
      undoDebugLog('keydown:undo_hotkey', {
        key,
        isUndo,
        isRedo,
        interactionEnabled: interactionEnabled.value,
        ignoredTarget: shouldIgnoreUndoHotkey(e.target),
        targetTag: e.target?.tagName ?? null,
        eventPhase: e.eventPhase,
        defaultPrevented: e.defaultPrevented,
      })
    }

    if (!interactionEnabled.value) {
      if (isUndo || isRedo) undoDebugLog('keydown:blocked_interaction_disabled')
      return
    }
    if (shouldIgnoreUndoHotkey(e.target)) {
      if (isUndo || isRedo) undoDebugLog('keydown:blocked_editable_target')
      return
    }

    if (key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright') {
      const handled = overlayApi?.nudgeSelectedElementByArrowKey(key)
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
      return
    }

    if (!mod) return

    if (key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undoDebugLog('keydown:undo_invoke')
      history.undo()
      return
    }

    if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault()
      undoDebugLog('keydown:redo_invoke')
      history.redo()
    }
  }

  const frame = useVisualHtmlFrame({
    interactionEnabled,
    onSelectElement: (el) => {
      styleFormApi?.readStyleFormFromElement(el)
      statusText.value = `已选中：${frame.selectedLabel.value}`
      overlayApi?.scheduleOverlayUpdate()
    },
    onOverlayDragCheck: () => overlayApi?.isDragging() ?? false,
    onOverlayResetNudge: () => overlayApi?.resetKeyboardNudge(),
    onGlobalKeydown: handleGlobalKeydown,
    onFrameBound: (doc) => {
      setEditGuidesForMode()
      overlayApi?.ensureOverlayDom()
      overlayApi?.bindScrollResizeListeners(doc)
    },
    onFrameUnbound: () => {
      overlayApi?.unbindScrollResizeListeners()
    },
  })

  const history = useVisualHtmlHistory({
    getCurrentBodyHtml,
    getDocRoot: () => frame.docRootRef.value,
    onDirtyChange: updateDirtyFlagFromDom,
    onBeforeRestore: async () => {
      undoDebugLog('onBeforeRestore', {
        selectedTag: frame.selectedElement.value?.tagName ?? null,
        selectedConnected: frame.selectedElement.value?.isConnected ?? null,
        selectedLabel: frame.selectedLabel.value,
        overlayDragging: overlayApi?.isDragging?.() ?? null,
      })
      frame.revokeSelectionOutline()
      frame.selectedElement.value = null
      frame.selectedLabel.value = ''
      statusText.value = '已恢复历史版本（尚未保存）'
    },
    onAfterRestore: async () => {
      const doc = frame.frameDocumentRef.value
      const body = frame.docRootRef.value
      const overlayEl = doc?.getElementById?.('__vhe_overlay_root__')
      undoDebugDom('onAfterRestore', {
        hasDoc: Boolean(doc),
        hasBody: Boolean(body),
        bodyConnected: body?.isConnected ?? null,
        bodyChildCount: body?.children?.length ?? null,
        bodyHasEditingAttr: body?.getAttribute?.('data-vhe-editing') ?? null,
        overlayExists: Boolean(overlayEl),
        overlayHidden: overlayEl?.getAttribute?.('data-hidden') ?? null,
        overlayLive: overlayEl?.dataset?.vheLive ?? null,
        pointerListenerBound: frame.isPointerListenerBound?.() ?? null,
      })
      overlayApi?.rebuildOverlayDom()
      overlayApi?.setOverlayHidden(true)
      undoDebugDom('onAfterRestore:after_overlay', {
        overlayDragging: overlayApi?.isDragging?.() ?? null,
        selectedTag: frame.selectedElement.value?.tagName ?? null,
      })
    },
  })

  const styleForm = useVisualHtmlStyleForm({
    selectedElement: frame.selectedElement,
    onDirtyChange: updateDirtyFlagFromDom,
    requestSnapshot: history.requestSnapshot,
    isRestoringSnapshot: history.isRestoringSnapshot,
    statusText,
  })
  styleFormApi = styleForm

  const overlay = useVisualHtmlOverlay({
    getFrameDocument: () => frame.frameDocumentRef.value,
    getDocRoot: () => frame.docRootRef.value,
    selectedElement: frame.selectedElement,
    selectedLabel: frame.selectedLabel,
    interactionEnabled,
    onDirtyChange: updateDirtyFlagFromDom,
    requestSnapshot: history.requestSnapshot,
    readStyleFormFromElement: styleForm.readStyleFormFromElement,
    statusText,
  })
  overlayApi = overlay

  const stopStyleWatchers = styleForm.bindAutoApplyWatchers()

  function flushCurrentVersionState() {
    if (!enableVersions) return
    const version = versionManager.activeVersion.value
    if (!version) return
    if (!isHTMLElementNode(frame.docRootRef.value)) return

    const doc = frame.frameDocumentRef.value
    history.ensureAnchorBodyHtml(getCurrentBodyHtml())

    versionManager.flushVersionState(version, {
      html: doc?.documentElement ? serializeDocumentHtml(doc) : sourceHtml.value,
      ...history.captureHistoryState(),
    })
  }

  function establishVersionAnchor() {
    const current = getCurrentBodyHtml()
    if (!String(history.getAnchorBodyHtml() ?? '').trim()) {
      history.setAnchorBodyHtml(current)
    }
    if (!history.historyCurrent.value) {
      history.historyCurrent.value = history.makeSnapshot('load')
    }
    undoDebugStack('establishVersionAnchor', {
      past: history.historyPast.value,
      current: history.historyCurrent.value,
      future: history.historyFuture.value,
      anchor: history.getAnchorBodyHtml(),
    })
  }

  async function loadFromHtml(html, loadOptions = {}) {
    const { resetHistory = true, initializeVersions = false } = loadOptions
    frame.detachDocPointerListener()
    frame.revokeSelectionOutline()
    frame.selectedElement.value = null
    frame.selectedLabel.value = ''
    frame.docRootRef.value = null
    frame.frameDocumentRef.value = null

    const parsed = parseHtmlForEdit(html)
    sourceHtml.value = parsed.sourceHtml
    documentHtml.value = parsed.documentHtml
    dirty.value = false
    if (resetHistory) {
      history.resetHistoryStacks({ resetAnchor: true })
    }
    statusText.value = parsed.documentHtml ? '点击页面元素进行编辑' : '暂无 HTML 内容'

    if (initializeVersions && enableVersions) {
      versionManager.resetVersions(parsed.sourceHtml)
    }

    if (resetHistory) {
      history.resetHistoryStacks()
    }
    await nextTick()
  }

  function onDocRootReady() {
    if (!frame.docRootRef.value) return
    undoDebugLog('onDocRootReady:begin', {
      rootTag: frame.docRootRef.value?.tagName ?? null,
      childCount: frame.docRootRef.value?.children?.length ?? null,
      pointerListenerBound: frame.isPointerListenerBound?.() ?? null,
    })
    const pendingHistory = enableVersions ? versionManager.consumePendingHistoryRestore() : null
    if (pendingHistory) {
      history.applyHistoryState({
        past: pendingHistory.past,
        current: pendingHistory.current,
        future: pendingHistory.future,
        baseline: pendingHistory.baseline,
      })
    } else {
      establishVersionAnchor()
    }
    // persistence 恢复时 baseline 常为空，applyHistoryState 会留下空锚点导致误判 dirty
    if (!String(history.getAnchorBodyHtml() ?? '').trim()) {
      establishVersionAnchor()
    }

    updateDirtyFlagFromDom()

    if (enableVersions) {
      flushCurrentVersionState()
    }

    debugLog('root:ready', {
      rootTag: frame.docRootRef.value?.tagName || null,
      childCount: frame.docRootRef.value?.children?.length ?? null,
      dirty: dirty.value,
      versionId: enableVersions ? versionManager.activeVersionId.value : null,
    })
    undoDebugStack('onDocRootReady', {
      past: history.historyPast.value,
      current: history.historyCurrent.value,
      future: history.historyFuture.value,
      anchor: history.getAnchorBodyHtml(),
    })
  }

  function getHtml() {
    const selected = frame.selectedElement.value
    frame.revokeSelectionOutline()
    const doc = frame.frameDocumentRef.value
    const html = doc?.documentElement ? captureLiveDocumentHtml(doc) : sourceHtml.value
    if (isHTMLElementNode(selected) && doc?.body?.contains(selected)) {
      frame.applySelectionOutline(selected)
    }
    return html
  }

  function getEditChangeLog() {
    const initialHtml = String(history.getAnchorBodyHtml() ?? '')
    const currentHtml = getCurrentBodyHtml()
    undoDebugLog('getEditChangeLog', {
      initialLen: initialHtml.length,
      currentLen: currentHtml.length,
      equal: initialHtml === currentHtml,
      selectedTag: frame.selectedElement.value?.tagName ?? null,
      selectedConnected: frame.selectedElement.value?.isConnected ?? null,
    })
    if (!initialHtml.trim() && !currentHtml.trim()) return []

    const doc = document.implementation.createHTMLDocument('')
    const entries = buildEditChangeLog(doc.body, initialHtml, currentHtml)
    undoDebugLog('getEditChangeLog:result', { entryCount: entries.length })
    return entries
  }

  function getEditChangeLogText() {
    const selected = frame.selectedElement.value
    frame.revokeSelectionOutline()
    overlayApi?.setOverlayHidden(true)
    try {
      return formatEditChangeLogForAi(getEditChangeLog())
    } finally {
      overlayApi?.setOverlayHidden(false)
      if (isHTMLElementNode(selected) && frame.docRootRef.value?.contains(selected)) {
        frame.applySelectionOutline(selected)
      }
    }
  }

  function resetBaselineAfterCommit(html) {
    if (html !== undefined) {
      sourceHtml.value = String(html || '')
      documentHtml.value = sourceHtml.value
      if (enableVersions) {
        versionManager.updateActiveVersionHtml(sourceHtml.value)
      }
    }
    history.resetHistoryStacks({ resetAnchor: true })
    history.setAnchorBodyHtml(getCurrentBodyHtml())
    history.historyCurrent.value = history.makeSnapshot('save')
    updateDirtyFlagFromDom()
    if (enableVersions) {
      flushCurrentVersionState()
    }
  }

  async function reset() {
    await loadFromHtml(sourceHtml.value, { initializeVersions: enableVersions })
  }

  async function reload(html) {
    await loadFromHtml(html, { initializeVersions: enableVersions })
  }

  function versionDisplayName(version) {
    if (!version) return ''
    return String(version.label || '').trim() || '未命名版本'
  }

  async function switchVersion(versionId) {
    if (!enableVersions) return false
    const currentId = versionManager.activeVersionId.value
    if (String(versionId) === currentId) return true

    flushCurrentVersionState()
    const target = versionManager.selectVersion(versionId)
    if (!target) return false

    await loadFromHtml(target.html, { resetHistory: false })
    statusText.value = `已切换到${versionDisplayName(target)}`
    return true
  }

  async function saveAsNewVersion(meta = {}) {
    if (!enableVersions) return null
    flushCurrentVersionState()
    const html = versionManager.getVersionHtml(versionManager.activeVersionId.value) || getHtml()
    if (!html.trim()) return null

    const entry = versionManager.createNextVersion(html, meta)
    await loadFromHtml(html, { resetHistory: true })
    statusText.value = `已创建${versionDisplayName(entry)}`
    return entry
  }

  async function importAsNewVersion(html, meta = {}) {
    if (!enableVersions) return null
    const payload = String(html ?? '').trim()
    if (!payload) return null

    flushCurrentVersionState()
    const entry = versionManager.createNextVersion(payload, {
      label: '上传',
      ...meta,
    })
    await loadFromHtml(payload, { resetHistory: true })
    statusText.value = `已从上传内容创建${versionDisplayName(entry)}`
    return entry
  }

  async function removeVersion(versionId) {
    if (!enableVersions) return null
    if (versionManager.versions.value.length <= 1) return null

    const targetId = String(versionId || '')
    const isActive = versionManager.activeVersionId.value === targetId

    if (!isActive) {
      flushCurrentVersionState()
    }

    const result = versionManager.removeVersion(targetId)
    if (!result) return null

    if (result.switchedTo) {
      await loadFromHtml(result.switchedTo.html, { resetHistory: false })
      statusText.value = `已删除${versionDisplayName(result.removed)}，当前 ${versionDisplayName(result.switchedTo)}`
    } else {
      statusText.value = `已删除${versionDisplayName(result.removed)}`
    }

    return result
  }

  function getActiveVersionHtml() {
    if (!enableVersions) return getHtml()
    flushCurrentVersionState()
    return versionManager.getVersionHtml(versionManager.activeVersionId.value) || getHtml()
  }

  function exportVersionState() {
    if (!enableVersions) return null
    flushCurrentVersionState()
    return versionManager.exportVersionState()
  }

  function importVersionState(state) {
    if (!enableVersions) return false
    if (!versionManager.importVersionState(state)) return false

    const target = versionManager.activeVersion.value
    if (target) {
      const hasHistory = String(target.baselineBodyHtml ?? '').trim()
        || (Array.isArray(target.historyPast) && target.historyPast.length > 0)
        || target.historyCurrent
        || (Array.isArray(target.historyFuture) && target.historyFuture.length > 0)
      if (hasHistory) {
        versionManager.queueHistoryRestore({
          historyPast: target.historyPast,
          historyCurrent: target.historyCurrent,
          historyFuture: target.historyFuture,
          baselineBodyHtml: target.baselineBodyHtml,
        })
      }
    }
    return true
  }

  function setInteractionEnabled(enabled) {
    interactionEnabled.value = Boolean(enabled)
    setEditGuidesForMode()
    if (!enabled) clearSelection()
    debugLog('interaction:set', { enabled: interactionEnabled.value })
  }

  function clearSelection() {
    frame.clearSelection()
    overlay.setOverlayHidden(true)
  }

  function teardownFrameBindings() {
    overlay.unbindScrollResizeListeners()
    frame.teardownDocListeners()
  }

  onBeforeUnmount(() => {
    frame.revokeSelectionOutline()
    teardownFrameBindings()
    stopStyleWatchers()
    window.removeEventListener('keydown', handleGlobalKeydown, true)
  })

  onMounted(() => {
    window.addEventListener('keydown', handleGlobalKeydown, true)
    if (isUndoDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.log(
        '[VHE:undo] 诊断日志已开启。控制台过滤 `[VHE:undo]` 查看撤销相关事件。'
        + ' 关闭: localStorage.setItem("vhe:undo-debug","0") 后刷新；'
        + ' 强制开启: localStorage.setItem("vhe:undo-debug","1")',
      )
    }
  })

  return {
    documentHtml,
    dirty,
    statusText,
    selectedElement: frame.selectedElement,
    selectedLabel: frame.selectedLabel,
    styleForm: styleForm.styleForm,
    textForm: styleForm.textForm,
    canEditTextContent: styleForm.canEditTextContent,
    canEditPlaceholder: styleForm.canEditPlaceholder,
    textContentLabel: styleForm.textContentLabel,
    applySelectedChanges: styleForm.applySelectedChanges,
    reloadSelectedStyle: styleForm.reloadSelectedStyle,
    clearSelectedStyle: styleForm.clearSelectedStyle,
    loadFromHtml,
    bindFrameDocument: frame.bindFrameDocument,
    attachDocPointerListener: frame.attachDocPointerListener,
    detachDocPointerListener: frame.detachDocPointerListener,
    onDocRootReady,
    teardownFrameBindings,
    setEditGuidesEnabled: frame.setEditGuidesEnabled,
    getHtml,
    getActiveVersionHtml,
    reset,
    reload,
    resetBaselineAfterCommit,
    setInteractionEnabled,
    clearSelection,
    undo: history.undo,
    redo: history.redo,
    getEditChangeLog,
    getEditChangeLogText,
    versions: versionManager.versions,
    activeVersionId: versionManager.activeVersionId,
    versionCount: versionManager.versionCount,
    switchVersion,
    saveAsNewVersion,
    importAsNewVersion,
    removeVersion,
    flushCurrentVersionState,
    exportVersionState,
    importVersionState,
    enableVersions,
  }
}
