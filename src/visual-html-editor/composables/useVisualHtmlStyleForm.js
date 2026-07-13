import { computed, reactive, ref, watch } from 'vue'
import { createDefaultStyleForm, STYLE_KEYS } from '../constants/styleKeys.js'
import {
  getTextEditKind,
  normalizeHexColor,
  normalizePxNumberOrEmpty,
  normalizeTextDecoration,
  setInlineStyle,
} from '../utils/domSelection.js'
import {
  getElementComputedStyle,
  isHTMLElementNode,
  normalizeNumberOrEmpty,
  SELECTION_OUTLINE,
  undoDebugLog,
} from '../utils/editorDom.js'

/**
 * Style/text property panel state and DOM ↔ form synchronization.
 */
export function useVisualHtmlStyleForm(options = {}) {
  const {
    selectedElement,
    onDirtyChange,
    requestSnapshot,
    isRestoringSnapshot,
    statusText,
  } = options

  const hydratingForm = ref(false)
  const styleForm = reactive(createDefaultStyleForm())
  const baselineForm = reactive(createDefaultStyleForm())
  const textForm = reactive({ text: '', placeholder: '' })
  const baselineTextForm = reactive({ text: '', placeholder: '' })
  const dirtyText = ref(false)
  const dirtyPlaceholder = ref(false)
  const dirtyFields = reactive(
    STYLE_KEYS.reduce((acc, key) => {
      acc[key] = false
      return acc
    }, {}),
  )

  const canEditTextContent = computed(() => Boolean(getTextEditKind(selectedElement.value)))
  const canEditPlaceholder = computed(() => {
    const kind = getTextEditKind(selectedElement.value)
    return kind === 'input' || kind === 'textarea'
  })
  const textContentLabel = computed(() => {
    const kind = getTextEditKind(selectedElement.value)
    if (kind === 'input' || kind === 'textarea') return '元素内容（value）'
    return '元素内容（HTML）'
  })

  function readTextFormFromElement(el) {
    const kind = getTextEditKind(el)
    if (!kind) {
      textForm.text = ''
      baselineTextForm.text = ''
      textForm.placeholder = ''
      baselineTextForm.placeholder = ''
      dirtyText.value = false
      dirtyPlaceholder.value = false
      return
    }

    if (kind === 'input' || kind === 'textarea') {
      const v = String(el.value ?? '')
      textForm.text = v
      baselineTextForm.text = v
      dirtyText.value = false
      const p = String(el.getAttribute('placeholder') ?? '')
      textForm.placeholder = p
      baselineTextForm.placeholder = p
      dirtyPlaceholder.value = false
      return
    }

    const v = kind === 'innerHTML' ? String(el.innerHTML ?? '') : String(el.textContent ?? '')
    textForm.text = v
    baselineTextForm.text = v
    textForm.placeholder = ''
    baselineTextForm.placeholder = ''
    dirtyText.value = false
    dirtyPlaceholder.value = false
  }

  function readStyleFormFromElement(el) {
    hydratingForm.value = true
    const style = getElementComputedStyle(el)
    const inlineStyle = el.style
    styleForm.color = normalizeHexColor(style.color, '#111111')
    styleForm.backgroundColor = normalizeHexColor(style.backgroundColor, '#ffffff')
    styleForm.fontSize = Number.parseInt(style.fontSize, 10) || 16
    styleForm.fontWeight = String(style.fontWeight || '')
    styleForm.fontFamily = String(style.fontFamily || '')
    styleForm.lineHeight = normalizePxNumberOrEmpty(style.lineHeight)
    styleForm.fontStyle = style.fontStyle === 'normal' ? '' : String(style.fontStyle || '')
    styleForm.letterSpacing = normalizePxNumberOrEmpty(style.letterSpacing)
    styleForm.textDecoration = normalizeTextDecoration(style.textDecorationLine || style.textDecoration || '')
    styleForm.textTransform = style.textTransform === 'none' ? '' : String(style.textTransform || '')
    styleForm.whiteSpace = style.whiteSpace === 'normal' ? '' : String(style.whiteSpace || '')
    styleForm.height = normalizePxNumberOrEmpty(style.height)
    styleForm.display = style.display === 'block' ? '' : String(style.display || '')
    styleForm.position = style.position === 'static' ? '' : String(style.position || '')
    styleForm.top = normalizeNumberOrEmpty(inlineStyle.top || style.top)
    styleForm.right = normalizeNumberOrEmpty(inlineStyle.right || style.right)
    styleForm.bottom = normalizeNumberOrEmpty(inlineStyle.bottom || style.bottom)
    styleForm.left = normalizeNumberOrEmpty(inlineStyle.left || style.left)
    styleForm.zIndex = normalizeNumberOrEmpty(inlineStyle.zIndex || style.zIndex)
    styleForm.opacity = normalizeNumberOrEmpty(inlineStyle.opacity || style.opacity)
    styleForm.overflow = style.overflow === 'visible' ? '' : String(style.overflow || '')
    styleForm.float = style.cssFloat === 'none' ? '' : String(style.cssFloat || '')
    styleForm.borderRadius = Number.parseInt(style.borderRadius, 10) || 0
    styleForm.borderWidth = Number.parseInt(style.borderTopWidth, 10) || 0
    styleForm.borderStyle = style.borderTopStyle === 'none' ? '' : String(style.borderTopStyle || '')
    styleForm.borderColor = normalizeHexColor(style.borderTopColor, '#000000')
    styleForm.padding = Number.parseInt(style.paddingTop, 10) || 0
    styleForm.marginTop = Number.parseInt(style.marginTop, 10) || 0
    styleForm.marginLeft = Number.parseInt(style.marginLeft, 10) || 0
    styleForm.textAlign = style.textAlign === 'start' ? '' : style.textAlign || ''

    const inlineWidth = String(inlineStyle.width || '').trim()
    const widthMatch = inlineWidth.match(/^(\d+(?:\.\d+)?)%$/)
    styleForm.widthPercent = widthMatch ? Math.round(Number(widthMatch[1])) : 100

    STYLE_KEYS.forEach((key) => {
      baselineForm[key] = styleForm[key]
      dirtyFields[key] = false
    })
    readTextFormFromElement(el)
    setTimeout(() => {
      hydratingForm.value = false
    }, 0)
  }

  function applyStyleField(el, key, useCurrentValue) {
    switch (key) {
      case 'color':
        setInlineStyle(el, 'color', useCurrentValue ? styleForm.color || '' : '')
        return true
      case 'backgroundColor':
        setInlineStyle(el, 'background-color', useCurrentValue ? styleForm.backgroundColor || '' : '')
        return true
      case 'fontSize':
        setInlineStyle(el, 'font-size', useCurrentValue && styleForm.fontSize ? `${styleForm.fontSize}px` : '')
        return true
      case 'fontWeight':
        setInlineStyle(el, 'font-weight', useCurrentValue ? styleForm.fontWeight || '' : '')
        return true
      case 'fontFamily':
        setInlineStyle(el, 'font-family', useCurrentValue ? styleForm.fontFamily || '' : '')
        return true
      case 'lineHeight':
        setInlineStyle(
          el,
          'line-height',
          useCurrentValue && styleForm.lineHeight !== '' && styleForm.lineHeight !== undefined && styleForm.lineHeight !== null
            ? `${styleForm.lineHeight}px`
            : '',
        )
        return true
      case 'fontStyle':
        setInlineStyle(el, 'font-style', useCurrentValue ? styleForm.fontStyle || '' : '')
        return true
      case 'letterSpacing':
        setInlineStyle(
          el,
          'letter-spacing',
          useCurrentValue && styleForm.letterSpacing !== '' && styleForm.letterSpacing !== undefined && styleForm.letterSpacing !== null
            ? `${styleForm.letterSpacing}px`
            : '',
        )
        return true
      case 'textDecoration':
        setInlineStyle(el, 'text-decoration', useCurrentValue ? styleForm.textDecoration || '' : '')
        return true
      case 'textTransform':
        setInlineStyle(el, 'text-transform', useCurrentValue ? styleForm.textTransform || '' : '')
        return true
      case 'whiteSpace':
        setInlineStyle(el, 'white-space', useCurrentValue ? styleForm.whiteSpace || '' : '')
        return true
      case 'height':
        setInlineStyle(
          el,
          'height',
          useCurrentValue && styleForm.height !== '' && styleForm.height !== undefined && styleForm.height !== null
            ? `${styleForm.height}px`
            : '',
        )
        return true
      case 'display':
        setInlineStyle(el, 'display', useCurrentValue ? styleForm.display || '' : '')
        return true
      case 'position':
        setInlineStyle(el, 'position', useCurrentValue ? styleForm.position || '' : '')
        return true
      case 'top':
        setInlineStyle(el, 'top', useCurrentValue && styleForm.top !== '' && styleForm.top !== undefined && styleForm.top !== null ? `${styleForm.top}px` : '')
        return true
      case 'right':
        setInlineStyle(el, 'right', useCurrentValue && styleForm.right !== '' && styleForm.right !== undefined && styleForm.right !== null ? `${styleForm.right}px` : '')
        return true
      case 'bottom':
        setInlineStyle(el, 'bottom', useCurrentValue && styleForm.bottom !== '' && styleForm.bottom !== undefined && styleForm.bottom !== null ? `${styleForm.bottom}px` : '')
        return true
      case 'left':
        setInlineStyle(el, 'left', useCurrentValue && styleForm.left !== '' && styleForm.left !== undefined && styleForm.left !== null ? `${styleForm.left}px` : '')
        return true
      case 'zIndex':
        setInlineStyle(el, 'z-index', useCurrentValue && styleForm.zIndex !== '' && styleForm.zIndex !== undefined && styleForm.zIndex !== null ? String(styleForm.zIndex) : '')
        return true
      case 'opacity':
        setInlineStyle(el, 'opacity', useCurrentValue && styleForm.opacity !== '' && styleForm.opacity !== undefined && styleForm.opacity !== null ? String(styleForm.opacity) : '')
        return true
      case 'overflow':
        setInlineStyle(el, 'overflow', useCurrentValue ? styleForm.overflow || '' : '')
        return true
      case 'float':
        setInlineStyle(el, 'float', useCurrentValue ? styleForm.float || '' : '')
        return true
      case 'borderRadius':
        setInlineStyle(el, 'border-radius', useCurrentValue && styleForm.borderRadius ? `${styleForm.borderRadius}px` : '')
        return true
      case 'borderWidth':
        setInlineStyle(el, 'border-width', useCurrentValue && styleForm.borderWidth ? `${styleForm.borderWidth}px` : '')
        return true
      case 'borderStyle':
        setInlineStyle(el, 'border-style', useCurrentValue ? styleForm.borderStyle || '' : '')
        return true
      case 'borderColor':
        setInlineStyle(el, 'border-color', useCurrentValue ? styleForm.borderColor || '' : '')
        return true
      case 'padding':
        setInlineStyle(el, 'padding', useCurrentValue && styleForm.padding ? `${styleForm.padding}px` : '')
        return true
      case 'marginTop':
        setInlineStyle(el, 'margin-top', useCurrentValue ? `${styleForm.marginTop || 0}px` : '')
        return true
      case 'marginLeft':
        setInlineStyle(el, 'margin-left', useCurrentValue ? `${styleForm.marginLeft || 0}px` : '')
        return true
      case 'widthPercent':
        setInlineStyle(el, 'width', useCurrentValue && styleForm.widthPercent ? `${styleForm.widthPercent}%` : '')
        return true
      case 'textAlign':
        setInlineStyle(el, 'text-align', useCurrentValue ? styleForm.textAlign || '' : '')
        return true
      default:
        return false
    }
  }

  function applySelectedStyle(isAuto = false, changedKey = '') {
    const el = selectedElement.value
    if (!isHTMLElementNode(el)) {
      if (changedKey) {
        undoDebugLog('style:apply_skip_no_element', { isAuto, changedKey })
      }
      return
    }
    if (isRestoringSnapshot?.value) {
      undoDebugLog('style:apply_during_restoring', { isAuto, changedKey, elTag: el.tagName, elConnected: el.isConnected })
    }

    let hasChange = false
    if (changedKey) {
      hasChange = applyStyleField(el, changedKey, dirtyFields[changedKey])
    } else {
      STYLE_KEYS.forEach((key) => {
        if (dirtyFields[key]) {
          hasChange = applyStyleField(el, key, true) || hasChange
        }
      })
    }

    if (!hasChange) {
      if (!isAuto && !dirtyText.value && !dirtyPlaceholder.value) statusText.value = '当前没有可应用的改动'
      return
    }

    onDirtyChange?.()
    requestSnapshot?.(isAuto ? 'style:auto' : 'style:apply')
    undoDebugLog('style:apply_ok', { isAuto, changedKey, elTag: el.tagName, elConnected: el.isConnected })
    statusText.value = isAuto ? '已实时应用（尚未保存）' : '已应用到页面（尚未保存）'
  }

  function applySelectedTextContent(isAuto = false) {
    const el = selectedElement.value
    if (!isHTMLElementNode(el)) return
    if (!dirtyText.value) return

    const kind = getTextEditKind(el)
    if (!kind) return

    if (kind === 'input' || kind === 'textarea') {
      el.value = String(textForm.text ?? '')
    } else {
      el.innerHTML = String(textForm.text ?? '')
    }

    onDirtyChange?.()
    requestSnapshot?.(isAuto ? 'text:auto' : 'text:apply')
    statusText.value = isAuto ? '已实时应用（尚未保存）' : '已应用到页面（尚未保存）'
  }

  function applySelectedPlaceholder(isAuto = false) {
    const el = selectedElement.value
    if (!isHTMLElementNode(el)) return
    if (!dirtyPlaceholder.value) return

    const kind = getTextEditKind(el)
    if (kind !== 'input' && kind !== 'textarea') return

    const p = String(textForm.placeholder ?? '')
    if (p) {
      el.setAttribute('placeholder', p)
    } else {
      el.removeAttribute('placeholder')
    }

    onDirtyChange?.()
    requestSnapshot?.(isAuto ? 'placeholder:auto' : 'placeholder:apply')
    statusText.value = isAuto ? '已实时应用（尚未保存）' : '已应用到页面（尚未保存）'
  }

  function applySelectedChanges() {
    applySelectedTextContent(false)
    applySelectedPlaceholder(false)
    applySelectedStyle(false)
  }

  function reloadSelectedStyle() {
    const el = selectedElement.value
    if (!isHTMLElementNode(el)) return
    readStyleFormFromElement(el)
    statusText.value = '已重置表单'
  }

  function clearSelectedStyle() {
    const el = selectedElement.value
    if (!isHTMLElementNode(el)) return
    el.removeAttribute('style')
    if (isHTMLElementNode(el)) {
      el.style.outline = SELECTION_OUTLINE
      el.style.outlineOffset = '2px'
    }
    readStyleFormFromElement(el)
    onDirtyChange?.()
    requestSnapshot?.('style:clear')
    statusText.value = '已清除选中元素样式（尚未保存）'
  }

  function bindAutoApplyWatchers() {
    const stops = []

    STYLE_KEYS.forEach((key) => {
      stops.push(watch(
        () => styleForm[key],
        (value) => {
          if (hydratingForm.value || isRestoringSnapshot?.value) return
          dirtyFields[key] = value !== baselineForm[key]
          applySelectedStyle(true, key)
        },
      ))
    })

    stops.push(watch(
      () => textForm.text,
      (value) => {
        if (hydratingForm.value || isRestoringSnapshot?.value) return
        dirtyText.value = value !== baselineTextForm.text
        applySelectedTextContent(true)
      },
    ))

    stops.push(watch(
      () => textForm.placeholder,
      (value) => {
        if (hydratingForm.value || isRestoringSnapshot?.value) return
        dirtyPlaceholder.value = value !== baselineTextForm.placeholder
        applySelectedPlaceholder(true)
      },
    ))

    return () => stops.forEach((stop) => stop())
  }

  return {
    styleForm,
    textForm,
    hydratingForm,
    canEditTextContent,
    canEditPlaceholder,
    textContentLabel,
    readStyleFormFromElement,
    applySelectedChanges,
    reloadSelectedStyle,
    clearSelectedStyle,
    bindAutoApplyWatchers,
  }
}
