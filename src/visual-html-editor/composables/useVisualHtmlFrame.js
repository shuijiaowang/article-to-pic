import { ref } from 'vue'
import {
  findSelectableElement,
  getElementLabel,
  pickTargetFromEvent,
} from '../utils/domSelection.js'
import { EDIT_GUIDE_STYLE_ID, OVERLAY_ROOT_ID } from '../utils/htmlDocument.js'
import { debugLog, isHTMLElementNode, SELECTION_OUTLINE, undoDebugDom, undoDebugLog } from '../utils/editorDom.js'

/**
 * iframe document binding, element selection, and edit-mode interaction guards.
 */
export function useVisualHtmlFrame(options = {}) {
  const {
    interactionEnabled,
    onSelectElement,
    onOverlayDragCheck,
    onOverlayResetNudge,
    onGlobalKeydown,
    onFrameBound,
    onFrameUnbound,
  } = options

  const docRootRef = ref(null)
  const frameDocumentRef = ref(null)
  const selectedElement = ref(null)
  const selectedLabel = ref('')
  let boundPointerDoc = null

  function applySelectionOutline(el) {
    if (!isHTMLElementNode(el)) return
    el.style.outline = SELECTION_OUTLINE
    el.style.outlineOffset = '2px'
  }

  function revokeSelectionOutline() {
    const el = selectedElement.value
    if (!isHTMLElementNode(el)) return
    el.style.outline = ''
    el.style.outlineOffset = ''
  }

  function selectElement(el) {
    if (!isHTMLElementNode(el)) {
      undoDebugLog('select:block_not_element')
      return
    }
    if (!docRootRef.value?.contains(el)) {
      undoDebugLog('select:block_not_in_root', {
        elTag: el.tagName,
        elConnected: el.isConnected,
        hasRoot: Boolean(docRootRef.value),
        rootConnected: docRootRef.value?.isConnected ?? null,
      })
      return
    }
    if (el.tagName.toLowerCase() === 'html' || el.tagName.toLowerCase() === 'body') {
      undoDebugLog('select:block_html_body')
      return
    }

    revokeSelectionOutline()
    selectedElement.value = el
    selectedLabel.value = getElementLabel(el)
    applySelectionOutline(el)
    onSelectElement?.(el)
    undoDebugLog('select:ok', {
      label: selectedLabel.value,
      tag: el.tagName,
      connected: el.isConnected,
    })
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    } catch {
      // ignore
    }
  }

  function clearSelection() {
    revokeSelectionOutline()
    selectedElement.value = null
    selectedLabel.value = ''
    onOverlayResetNudge?.()
  }

  function handleDocPointerDown(event) {
    if (!interactionEnabled.value) {
      undoDebugLog('pointer:block_interaction_disabled', { type: event?.type })
      return
    }
    if (onOverlayDragCheck?.()) {
      undoDebugLog('pointer:block_overlay_dragging', { type: event?.type })
      return
    }
    const rawTarget = event?.target
    if (rawTarget?.closest?.(`#${OVERLAY_ROOT_ID}`)) {
      debugLog('pointer:ignore_overlay', {
        targetTag: rawTarget?.tagName || rawTarget?.nodeName || null,
        targetClass: rawTarget?.className || '',
      })
      undoDebugLog('pointer:ignore_overlay', {
        targetTag: rawTarget?.tagName || null,
        handle: rawTarget?.getAttribute?.('data-vhe-handle') || null,
      })
      return
    }
    onOverlayResetNudge?.()
    const target = pickTargetFromEvent(event)
    debugLog('pointer:event', {
      type: event?.type,
      targetTag: target?.tagName || target?.nodeName || null,
      targetClass: target?.className || '',
      hasRoot: Boolean(docRootRef.value),
      rootTag: docRootRef.value?.tagName || null,
    })
    undoDebugDom('pointer:event', {
      type: event?.type,
      targetTag: target?.tagName || null,
      hasRoot: Boolean(docRootRef.value),
      rootConnected: docRootRef.value?.isConnected ?? null,
      rootChildCount: docRootRef.value?.children?.length ?? null,
    })
    if (!target) {
      undoDebugLog('pointer:no_target')
      return
    }

    const root = docRootRef.value
    const selected = findSelectableElement(isHTMLElementNode(target) ? target : target.parentElement, root)
    debugLog('pointer:select_result', {
      selectedTag: selected?.tagName || null,
      selectedClass: selected?.className || '',
      selectedId: selected?.id || '',
    })
    if (!selected) {
      undoDebugLog('pointer:no_selectable', {
        targetTag: target?.tagName || null,
        rootTag: root?.tagName || null,
      })
      return
    }
    event.preventDefault()
    event.stopPropagation()
    selectElement(selected)
    debugLog('pointer:selected', { label: selectedLabel.value })
  }

  function handleDocClick(event) {
    if (!interactionEnabled.value) return
    const target = pickTargetFromEvent(event)
    debugLog('click:block', {
      type: event?.type,
      targetTag: target?.tagName || target?.nodeName || null,
      href: target?.getAttribute?.('href') || '',
    })
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation?.()
    return false
  }

  function handleDocSubmit(event) {
    if (!interactionEnabled.value) return
    debugLog('submit:block', {
      action: event?.target?.getAttribute?.('action') || '',
    })
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation?.()
    return false
  }

  function setEditGuidesEnabled(enabled) {
    const doc = frameDocumentRef.value
    if (!doc?.head || !doc?.body) return
    const styleId = EDIT_GUIDE_STYLE_ID
    let styleEl = doc.getElementById(styleId)

    if (!enabled) {
      doc.body.removeAttribute('data-vhe-editing')
      if (styleEl) styleEl.remove()
      return
    }

    if (!styleEl) {
      styleEl = doc.createElement('style')
      styleEl.id = styleId
      styleEl.textContent = `
body[data-vhe-editing] *:not(script):not(style):not(link):not(meta):not(title):not(#${EDIT_GUIDE_STYLE_ID}) {
  outline: 1px dashed rgb(124 58 237 / 18%);
  outline-offset: -1px;
}
body[data-vhe-editing] *:hover {
  outline-color: rgb(124 58 237 / 45%);
}
`
      doc.head.appendChild(styleEl)
    }
    doc.body.setAttribute('data-vhe-editing', '1')
  }

  function attachDocPointerListener(doc) {
    detachDocPointerListener()
    if (!doc) {
      undoDebugLog('listener:attach_skip_no_doc')
      return
    }
    boundPointerDoc = doc
    doc.addEventListener('pointerdown', handleDocPointerDown, true)
    doc.addEventListener('mousedown', handleDocPointerDown, true)
    doc.addEventListener('click', handleDocClick, true)
    doc.addEventListener('submit', handleDocSubmit, true)
    doc.addEventListener('keydown', onGlobalKeydown, true)
    debugLog('listener:attached', {
      url: doc.URL,
      bodyChildren: doc.body?.children?.length ?? null,
    })
    undoDebugLog('listener:attached', {
      url: doc.URL,
      bodyChildren: doc.body?.children?.length ?? null,
    })
  }

  function detachDocPointerListener() {
    if (!boundPointerDoc) return
    boundPointerDoc.removeEventListener('pointerdown', handleDocPointerDown, true)
    boundPointerDoc.removeEventListener('mousedown', handleDocPointerDown, true)
    boundPointerDoc.removeEventListener('click', handleDocClick, true)
    boundPointerDoc.removeEventListener('submit', handleDocSubmit, true)
    boundPointerDoc.removeEventListener('keydown', onGlobalKeydown, true)
    debugLog('listener:detached', { url: boundPointerDoc.URL })
    undoDebugLog('listener:detached', { url: boundPointerDoc.URL })
    boundPointerDoc = null
  }

  function isPointerListenerBound() {
    return Boolean(boundPointerDoc)
  }

  function bindDocRoot(el) {
    docRootRef.value = isHTMLElementNode(el) ? el : null
  }

  function bindFrameDocument(doc) {
    frameDocumentRef.value = doc || null
    bindDocRoot(isHTMLElementNode(doc?.body) ? doc.body : null)
    if (doc) {
      onFrameBound?.(doc)
    } else {
      onFrameUnbound?.()
    }
    debugLog('frame:bound', {
      hasDoc: Boolean(doc),
      bodyTag: doc?.body?.tagName || null,
      bodyChildren: doc?.body?.children?.length ?? null,
    })
  }

  function teardownDocListeners() {
    detachDocPointerListener()
    bindFrameDocument(null)
  }

  return {
    docRootRef,
    frameDocumentRef,
    selectedElement,
    selectedLabel,
    applySelectionOutline,
    revokeSelectionOutline,
    selectElement,
    clearSelection,
    bindFrameDocument,
    bindDocRoot,
    attachDocPointerListener,
    detachDocPointerListener,
    teardownDocListeners,
    setEditGuidesEnabled,
    isPointerListenerBound,
  }
}
