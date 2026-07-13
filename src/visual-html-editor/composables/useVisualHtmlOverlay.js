import { ref } from 'vue'
import { setInlineStyle } from '../utils/domSelection.js'
import { OVERLAY_ROOT_ID, OVERLAY_STYLE_ID } from '../utils/htmlDocument.js'
import {
  clampNumber,
  debugLog,
  getElementComputedStyle,
  isHTMLElementNode,
  readPxNumber,
  undoDebugLog,
} from '../utils/editorDom.js'

const OVERLAY_STYLE_TEXT = `
#${OVERLAY_ROOT_ID} {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2147483646;
}
#${OVERLAY_ROOT_ID}[data-hidden="1"] { display: none; }

#${OVERLAY_ROOT_ID} .vhe-box {
  position: absolute;
  box-sizing: border-box;
  border: 1px dashed rgb(124 58 237 / 55%);
  border-radius: 2px;
  background: rgb(124 58 237 / 3%);
}
#${OVERLAY_ROOT_ID} .vhe-handle {
  position: absolute;
  pointer-events: auto;
  user-select: none;
  touch-action: none;
}
#${OVERLAY_ROOT_ID} .vhe-edge {
  background: transparent;
}
#${OVERLAY_ROOT_ID} .vhe-edge.top { top: -6px; left: 0; right: 0; height: 12px; cursor: ns-resize; }
#${OVERLAY_ROOT_ID} .vhe-edge.left { left: -6px; top: 0; bottom: 0; width: 12px; cursor: ew-resize; }
#${OVERLAY_ROOT_ID} .vhe-edge.right { right: -6px; top: 0; bottom: 0; width: 12px; cursor: ew-resize; }
#${OVERLAY_ROOT_ID} .vhe-edge.bottom { bottom: -6px; left: 0; right: 0; height: 12px; cursor: ns-resize; }

#${OVERLAY_ROOT_ID} .vhe-corner.br {
  right: -8px;
  bottom: -8px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: rgb(124 58 237 / 70%);
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgb(15 23 42 / 18%);
  cursor: nwse-resize;
}
`

/**
 * Resize/drag overlay handles on the selected element.
 */
export function useVisualHtmlOverlay(options = {}) {
  const {
    getFrameDocument,
    getDocRoot,
    selectedElement,
    selectedLabel,
    interactionEnabled,
    onDirtyChange,
    requestSnapshot,
    readStyleFormFromElement,
    statusText,
  } = options

  const overlayEnabled = ref(true)
  const keyboardNudgeArmed = ref(false)
  const keyboardNudgeHandle = ref('')
  let overlayDragging = false
  let overlayDragState = null
  let overlayRaf = 0
  let boundScrollWin = null

  function getOverlayDoc() {
    return getFrameDocument()
  }

  function ensureOverlayDom({ forceRebuild = false } = {}) {
    const doc = getOverlayDoc()
    if (!doc?.head || !doc?.body) {
      undoDebugLog('overlay:ensure_skip_no_doc')
      return { root: null }
    }

    const staleRoot = doc.getElementById(OVERLAY_ROOT_ID)
    if (staleRoot && (forceRebuild || staleRoot.dataset.vheLive !== '1')) {
      undoDebugLog('overlay:remove_stale', {
        id: staleRoot.id,
        forceRebuild,
        rootLive: staleRoot.dataset?.vheLive ?? null,
      })
      staleRoot.remove()
    }

    let styleEl = doc.getElementById(OVERLAY_STYLE_ID)
    if (!styleEl) {
      styleEl = doc.createElement('style')
      styleEl.id = OVERLAY_STYLE_ID
      styleEl.textContent = OVERLAY_STYLE_TEXT
      doc.head.appendChild(styleEl)
      undoDebugLog('overlay:style_created')
    }

    let root = doc.getElementById(OVERLAY_ROOT_ID)
    const needsRebuild = forceRebuild || !root || root.dataset.vheLive !== '1'

    if (needsRebuild) {
      undoDebugLog('overlay:rebuild', {
        forceRebuild,
        hadRoot: Boolean(root),
        rootLive: root?.dataset?.vheLive ?? null,
      })
      root?.remove()

      root = doc.createElement('div')
      root.id = OVERLAY_ROOT_ID
      root.dataset.vheLive = '1'
      const bodyStyle = doc.body.style
      if (getElementComputedStyle(doc.body).position === 'static') {
        bodyStyle.position = 'relative'
        undoDebugLog('overlay:body_position_relative')
      }
      root.innerHTML = `
        <div class="vhe-box">
          <div class="vhe-handle vhe-edge top" data-vhe-handle="marginTop"></div>
          <div class="vhe-handle vhe-edge left" data-vhe-handle="marginLeft"></div>
          <div class="vhe-handle vhe-edge right" data-vhe-handle="width"></div>
          <div class="vhe-handle vhe-edge bottom" data-vhe-handle="height"></div>
          <div class="vhe-handle vhe-corner br" data-vhe-handle="scale"></div>
        </div>
      `
      root.addEventListener('pointerdown', handleOverlayRootPointerDown, true)
      doc.body.appendChild(root)
      undoDebugLog('overlay:rebuild_done', { bodyChildCount: doc.body.children.length })
    }

    return { root }
  }

  function rebuildOverlayDom() {
    return ensureOverlayDom({ forceRebuild: true })
  }

  function handleOverlayRootPointerDown(e) {
    const handle = e.target?.closest?.('[data-vhe-handle]')
    if (!handle) return
    handleOverlayPointerDown(e, handle)
  }

  function setOverlayHidden(hidden) {
    const { root } = ensureOverlayDom()
    if (!root) return
    root.setAttribute('data-hidden', hidden ? '1' : '0')
    undoDebugLog('overlay:hidden', { hidden: Boolean(hidden) })
  }

  function scheduleOverlayUpdate() {
    if (overlayRaf) return
    const doc = getOverlayDoc()
    const win = doc?.defaultView
    if (!win) return
    overlayRaf = win.requestAnimationFrame(() => {
      overlayRaf = 0
      updateOverlayForSelected()
    })
  }

  function updateOverlayForSelected() {
    const doc = getOverlayDoc()
    const win = doc?.defaultView
    const el = selectedElement.value
    const rootEl = getDocRoot()
    const { root } = ensureOverlayDom()
    if (!doc || !win || !root || !overlayEnabled.value) return

    if (!interactionEnabled.value || !isHTMLElementNode(el) || !isHTMLElementNode(rootEl) || !rootEl.contains(el)) {
      undoDebugLog('overlay:update_hidden', {
        interactionEnabled: interactionEnabled.value,
        hasEl: isHTMLElementNode(el),
        elConnected: el?.isConnected ?? null,
        hasRoot: isHTMLElementNode(rootEl),
        contains: isHTMLElementNode(el) && isHTMLElementNode(rootEl) ? rootEl.contains(el) : null,
        selectedTag: el?.tagName ?? null,
      })
      setOverlayHidden(true)
      return
    }

    const box = root.querySelector('.vhe-box')
    if (!box) return

    const r = el.getBoundingClientRect()
    const bodyRect = doc.body.getBoundingClientRect()
    const left = r.left - bodyRect.left + win.scrollX
    const top = r.top - bodyRect.top + win.scrollY

    box.style.left = `${left}px`
    box.style.top = `${top}px`
    box.style.width = `${Math.max(0, r.width)}px`
    box.style.height = `${Math.max(0, r.height)}px`
    setOverlayHidden(false)
  }

  function handleOverlayPointerDown(e, handleEl) {
    if (!interactionEnabled.value) return
    const handle = handleEl || e.currentTarget
    const kind = handle?.getAttribute?.('data-vhe-handle') || ''
    const el = selectedElement.value
    const doc = getOverlayDoc()
    if (!isHTMLElementNode(el) || !doc?.defaultView) return

    undoDebugLog('drag:start', { kind, selected: selectedLabel.value })

    overlayDragging = true
    keyboardNudgeArmed.value = true
    keyboardNudgeHandle.value = kind

    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation?.()

    requestSnapshot?.(`drag:start:${kind}`)

    const cs = doc.defaultView.getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    overlayDragState = {
      kind,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startMarginTop: readPxNumber(cs.marginTop),
      startMarginLeft: readPxNumber(cs.marginLeft),
      startWidth: rect.width,
      startHeight: rect.height,
      ratio: rect.height > 0 ? rect.width / rect.height : 1,
    }

    try {
      handle.setPointerCapture?.(e.pointerId)
    } catch {
      // ignore
    }

    const move = (ev) => handleOverlayPointerMove(ev)
    const up = (ev) => handleOverlayPointerUp(ev, handle, move, up)
    handle.addEventListener('pointermove', move, true)
    handle.addEventListener('pointerup', up, true)
    handle.addEventListener('pointercancel', up, true)
  }

  function handleOverlayPointerMove(e) {
    const st = overlayDragState
    const el = selectedElement.value
    if (!st || !isHTMLElementNode(el)) return
    if (st.pointerId !== undefined && e.pointerId !== st.pointerId) return

    const dx = e.clientX - st.startX
    const dy = e.clientY - st.startY

    if (st.kind === 'marginTop') {
      setInlineStyle(el, 'margin-top', `${Math.round(st.startMarginTop + dy)}px`)
    } else if (st.kind === 'marginLeft') {
      setInlineStyle(el, 'margin-left', `${Math.round(st.startMarginLeft + dx)}px`)
    } else if (st.kind === 'width') {
      setInlineStyle(el, 'width', `${Math.round(clampNumber(st.startWidth + dx, 0, 100000))}px`)
    } else if (st.kind === 'height') {
      setInlineStyle(el, 'height', `${Math.round(clampNumber(st.startHeight + dy, 0, 100000))}px`)
    } else if (st.kind === 'scale') {
      const base = Math.abs(dx) > Math.abs(dy) ? dx : dy
      const nextW = clampNumber(st.startWidth + base, 0, 100000)
      const ratio = st.ratio || 1
      const nextH = ratio ? nextW / ratio : st.startHeight + base
      setInlineStyle(el, 'width', `${Math.round(nextW)}px`)
      setInlineStyle(el, 'height', `${Math.round(nextH)}px`)
    }

    onDirtyChange?.()
    scheduleOverlayUpdate()
  }

  function handleOverlayPointerUp(e, handle, move, up) {
    const st = overlayDragState
    overlayDragState = null
    overlayDragging = false
    undoDebugLog('drag:end', { kind: st?.kind ?? null })
    try {
      handle.removeEventListener('pointermove', move, true)
      handle.removeEventListener('pointerup', up, true)
      handle.removeEventListener('pointercancel', up, true)
    } catch {
      // ignore
    }

    if (st) {
      requestSnapshot?.(`drag:end:${st.kind}`)
      statusText.value = '已拖拽应用（尚未保存）'
    }
    scheduleOverlayUpdate()
  }

  function nudgeSelectedElementByArrowKey(key) {
    if (!keyboardNudgeArmed.value) return false
    const el = selectedElement.value
    const root = getDocRoot()
    if (!isHTMLElementNode(el) || !isHTMLElementNode(root) || !root.contains(el)) return false

    let changed = false
    const style = getElementComputedStyle(el)
    const mt = readPxNumber(style.marginTop)
    const ml = readPxNumber(style.marginLeft)
    const w = Math.max(0, readPxNumber(style.width))
    const h = Math.max(0, readPxNumber(style.height))
    const handle = keyboardNudgeHandle.value

    if (handle === 'marginTop') {
      if (key === 'arrowup') {
        setInlineStyle(el, 'margin-top', `${Math.round(mt - 1)}px`)
        changed = true
      } else if (key === 'arrowdown') {
        setInlineStyle(el, 'margin-top', `${Math.round(mt + 1)}px`)
        changed = true
      }
    } else if (handle === 'marginLeft') {
      if (key === 'arrowleft') {
        setInlineStyle(el, 'margin-left', `${Math.round(ml - 1)}px`)
        changed = true
      } else if (key === 'arrowright') {
        setInlineStyle(el, 'margin-left', `${Math.round(ml + 1)}px`)
        changed = true
      }
    } else if (handle === 'width') {
      if (key === 'arrowleft') {
        setInlineStyle(el, 'width', `${Math.round(Math.max(0, w - 1))}px`)
        changed = true
      } else if (key === 'arrowright') {
        setInlineStyle(el, 'width', `${Math.round(w + 1)}px`)
        changed = true
      }
    } else if (handle === 'height') {
      if (key === 'arrowup') {
        setInlineStyle(el, 'height', `${Math.round(Math.max(0, h - 1))}px`)
        changed = true
      } else if (key === 'arrowdown') {
        setInlineStyle(el, 'height', `${Math.round(h + 1)}px`)
        changed = true
      }
    } else if (handle === 'scale') {
      const ratio = h > 0 ? w / h : 1
      if (key === 'arrowleft' || key === 'arrowup') {
        const nextW = Math.max(0, w - 1)
        const nextH = ratio > 0 ? nextW / ratio : Math.max(0, h - 1)
        setInlineStyle(el, 'width', `${Math.round(nextW)}px`)
        setInlineStyle(el, 'height', `${Math.round(nextH)}px`)
        changed = true
      } else if (key === 'arrowright' || key === 'arrowdown') {
        const nextW = w + 1
        const nextH = ratio > 0 ? nextW / ratio : h + 1
        setInlineStyle(el, 'width', `${Math.round(nextW)}px`)
        setInlineStyle(el, 'height', `${Math.round(nextH)}px`)
        changed = true
      }
    }

    if (!changed) return false
    readStyleFormFromElement?.(el)
    onDirtyChange?.()
    requestSnapshot?.(`nudge:${key}`)
    scheduleOverlayUpdate()
    statusText.value = '已通过方向键微调（1px）'
    return true
  }

  function resetKeyboardNudge() {
    keyboardNudgeArmed.value = false
    keyboardNudgeHandle.value = ''
  }

  function isDragging() {
    if (overlayDragging) {
      undoDebugLog('overlay:isDragging', { dragging: true, kind: overlayDragState?.kind ?? null })
    }
    return overlayDragging
  }

  function bindScrollResizeListeners(doc) {
    unbindScrollResizeListeners()
    const win = doc?.defaultView
    if (!win) return
    boundScrollWin = win
    win.addEventListener('scroll', scheduleOverlayUpdate, true)
    win.addEventListener('resize', scheduleOverlayUpdate, true)
  }

  function unbindScrollResizeListeners() {
    if (!boundScrollWin) return
    boundScrollWin.removeEventListener('scroll', scheduleOverlayUpdate, true)
    boundScrollWin.removeEventListener('resize', scheduleOverlayUpdate, true)
    boundScrollWin = null
  }

  return {
    keyboardNudgeArmed,
    keyboardNudgeHandle,
    ensureOverlayDom,
    rebuildOverlayDom,
    setOverlayHidden,
    scheduleOverlayUpdate,
    updateOverlayForSelected,
    nudgeSelectedElementByArrowKey,
    resetKeyboardNudge,
    isDragging,
    bindScrollResizeListeners,
    unbindScrollResizeListeners,
  }
}
