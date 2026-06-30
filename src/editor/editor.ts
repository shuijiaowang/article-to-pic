/**
 * TextToPic 可视化编辑器
 * 上传/打开 template.html → 点选 .page / .block → 句柄 + 面板改 style → 写回源文件
 */

import { resolveAssetsInDoc, restoreAssetRefsInHtml } from '@/utils/article-asset-html'
import { getPreviewScale } from '@/utils/texttopic/layout-report'

const STYLE_KEYS = [
  'font-size',
  'color',
  'font-weight',
  'line-height',
  'letter-spacing',
  'margin-top',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'padding',
  'background-color',
  'text-align',
  'border-radius',
  'width',
  'max-width',
]

const BLOCK_TYPES = [
  'cover-title',
  'cover-sub',
  'cover-tag',
  'h1',
  'h2',
  'text',
  'li',
  'quote',
  'img',
]

const BLOCK_TYPE_LABELS: Record<string, string> = {
  'cover-title': '封面标题',
  'cover-sub': '封面副标题',
  'cover-tag': '封面标签',
  h1: '一级标题',
  h2: '二级标题',
  text: '正文',
  li: '列表项',
  quote: '引用',
  img: '图片',
  block: '内容块',
}

const FONT_WEIGHT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '默认' },
  { value: '400', label: '正常 (400)' },
  { value: '500', label: '中等 (500)' },
  { value: '600', label: '半粗 (600)' },
  { value: '700', label: '粗体 (700)' },
  { value: '800', label: '超粗 (800)' },
]

const TEXT_ALIGN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '默认' },
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右对齐' },
]

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeFontWeight(value: string) {
  const map: Record<string, string> = {
    normal: '400',
    bold: '700',
    lighter: '300',
    bolder: '700',
  }
  return map[value] ?? value
}

const PICKER_TYPES = [{ description: 'HTML', accept: { 'text/html': ['.html', '.htm'] } }]
const HISTORY_MAX = 50
const HISTORY_INPUT_MS = 400

export interface EditorInitOptions {
  /** 文稿模式：隐藏文件打开入口，由外部负责保存 */
  articleMode?: boolean
}

export interface EditorApi {
  destroy: () => void
  loadHtml: (text: string, name?: string) => Promise<void>
  serializeHtml: () => string | null
  isDirty: () => boolean
  markClean: () => void
  refreshStatus: () => void
}

function requireEl<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Editor element #${id} not found`)
  return el as T
}

export function initEditor(options: EditorInitOptions = {}): EditorApi {
  const { articleMode = false } = options
  const canvasWrap = requireEl('canvas-wrap')
  const emptyState = requireEl('empty-state')
  const docEl = requireEl('doc')
  const tplStyles = document.createElement('style')
  tplStyles.id = 'tpl-styles'
  canvasWrap.insertBefore(tplStyles, docEl)
  const overlay = requireEl('ed-overlay')
  const selBox = requireEl('sel-box')
  const selLabel = requireEl('sel-label')
  const panelBody = requireEl('panel-body')
  const statusEl = requireEl('status')
  const fileInput = requireEl<HTMLInputElement>('file-input')

  let sourceDoc: Document | null = null
  let fileHandle: FileSystemFileHandle | null = null
  let fileName = ''
  let dirty = false
  let selected: HTMLElement | null = null
  let dragState: {
    handle: string
    startY: number
    startX: number
    marginTop: number
    marginLeft: number
    startWidthPct: number
    widthParentPx: number
    startWidthPx: number
    previewScale: number
  } | null = null

  let undoStack: string[] = []
  let redoStack: string[] = []
  let restoringHistory = false
  let historyPaused = false
  let inputHistoryCommitted = true
  let inputHistoryTimer: ReturnType<typeof setTimeout> | null = null

  const cleanups: Array<() => void> = []

  function on(el: EventTarget | null, type: string, handler: EventListener, options?: boolean | AddEventListenerOptions) {
    if (!el) return
    el.addEventListener(type, handler, options)
    cleanups.push(() => el.removeEventListener(type, handler, options))
  }

  function supportsFileSystemAccess() {
    return typeof window.showOpenFilePicker === 'function'
  }

  function refreshFileStatus() {
    if (!fileName) {
      setStatus(articleMode ? '正在加载…' : '请打开 / 拖拽 template.html', false)
      return
    }
    if (dirty) {
      if (articleMode) {
        setStatus(`${fileName} · 有未保存修改`, true)
        return
      }
      setStatus(
        fileHandle
          ? `${fileName} · 有未保存修改（可写回）`
          : `${fileName} · 有未保存修改（保存时将请求写权限）`,
        true,
      )
      return
    }
    setStatus(
      articleMode
        ? `${fileName} · 已同步`
        : fileHandle
          ? `${fileName} · 已绑定句柄，可直接写回`
          : `${fileName} · 已加载`,
      false,
    )
  }

  function updateSaveButtons() {
    const btnSave = document.getElementById('btn-save') as HTMLButtonElement | null
    const btnDownload = document.getElementById('btn-download') as HTMLButtonElement | null
    if (btnSave) btnSave.disabled = !sourceDoc
    if (btnDownload) btnDownload.disabled = !sourceDoc
  }

  function setStatus(msg: string, isDirty: boolean) {
    statusEl.textContent = msg
    statusEl.classList.toggle('dirty', !!isDirty)
  }

  function markDirty() {
    dirty = true
    updateSaveButtons()
    refreshFileStatus()
  }

  function markClean() {
    dirty = false
    refreshFileStatus()
  }

  function captureDocSnapshot() {
    stripEditorClasses(docEl)
    return docEl.innerHTML
  }

  function clearInputHistoryTimer() {
    if (inputHistoryTimer) {
      clearTimeout(inputHistoryTimer)
      inputHistoryTimer = null
    }
  }

  function clearHistoryStacks() {
    undoStack = []
    redoStack = []
    inputHistoryCommitted = true
    clearInputHistoryTimer()
  }

  function pushHistoryNow() {
    if (restoringHistory || historyPaused || !sourceDoc) return
    const snap = captureDocSnapshot()
    const top = undoStack[undoStack.length - 1]
    if (top === snap) return
    undoStack.push(snap)
    if (undoStack.length > HISTORY_MAX) undoStack.shift()
    redoStack = []
    inputHistoryCommitted = true
    clearInputHistoryTimer()
  }

  /** 连续输入（面板、拖拽中间态）合并为一步撤销 */
  function beginContinuousEdit() {
    if (restoringHistory || historyPaused || !sourceDoc) return
    if (inputHistoryCommitted) pushHistoryNow()
    inputHistoryCommitted = false
    clearInputHistoryTimer()
    inputHistoryTimer = setTimeout(() => {
      inputHistoryTimer = null
      inputHistoryCommitted = true
    }, HISTORY_INPUT_MS)
  }

  function getSelectionRestoreKey() {
    if (!selected) return null
    if (selected.classList.contains('page')) {
      return `page:${selected.getAttribute('data-page') || ''}`
    }
    const block = selected.closest('.block') as HTMLElement | null
    const id = block?.getAttribute('data-id') || selected.getAttribute('data-id')
    if (!id) return null
    return selected.tagName === 'IMG' ? `img:${id}` : `block:${id}`
  }

  function findElementByRestoreKey(key: string | null) {
    if (!key) return null
    if (key.startsWith('page:')) {
      const page = key.slice(5)
      return docEl.querySelector(`.page[data-page="${CSS.escape(page)}"]`) as HTMLElement | null
    }
    if (key.startsWith('block:')) {
      const id = key.slice(6)
      return docEl.querySelector(`.block[data-id="${CSS.escape(id)}"]`) as HTMLElement | null
    }
    if (key.startsWith('img:')) {
      const id = key.slice(4)
      const block = docEl.querySelector(`.block[data-id="${CSS.escape(id)}"]`)
      const img = block?.querySelector('img') as HTMLElement | null
      return img || (block as HTMLElement | null)
    }
    return null
  }

  async function restoreFromSnapshot(html: string, selectionKey: string | null) {
    restoringHistory = true
    try {
      if (selected) selected.classList.remove('ed-selected')
      selected = null
      docEl.innerHTML = html
      await resolveAssetsInDoc(docEl)
      syncToSourceDoc()
      markDirty()
      const el = findElementByRestoreKey(selectionKey)
      if (el && docEl.contains(el)) selectElement(el)
      else deselect()
    } finally {
      restoringHistory = false
    }
  }

  function undo() {
    if (!sourceDoc || undoStack.length === 0) return
    const selectionKey = getSelectionRestoreKey()
    redoStack.push(captureDocSnapshot())
    const prev = undoStack.pop()!
    void restoreFromSnapshot(prev, selectionKey)
  }

  function redo() {
    if (!sourceDoc || redoStack.length === 0) return
    const selectionKey = getSelectionRestoreKey()
    undoStack.push(captureDocSnapshot())
    const next = redoStack.pop()!
    void restoreFromSnapshot(next, selectionKey)
  }

  async function verifyHandleWrite(handle: FileSystemFileHandle | null) {
    if (!handle) return null
    try {
      let perm = await handle.queryPermission({ mode: 'readwrite' })
      if (perm !== 'granted') {
        perm = await handle.requestPermission({ mode: 'readwrite' })
      }
      return perm === 'granted' ? handle : null
    } catch {
      return null
    }
  }

  async function ensureWriteHandle() {
    if (fileHandle) {
      const ok = await verifyHandleWrite(fileHandle)
      if (ok) return ok
    }

    if (!supportsFileSystemAccess()) {
      throw new Error(
        '当前浏览器不支持 File System Access API，请使用 Chrome / Edge，并通过「打开 HTML」或拖拽本地文件加载',
      )
    }

    const [handle] = await window.showOpenFilePicker({
      mode: 'readwrite',
      types: PICKER_TYPES,
      multiple: false,
    })

    if (!handle) {
      throw new Error('未选择文件')
    }

    const granted = await verifyHandleWrite(handle)
    if (!granted) {
      throw new Error('未获得文件写入权限')
    }

    fileHandle = handle
    fileName = handle.name
    refreshFileStatus()
    return handle
  }

  async function getHandleFromDataTransfer(dataTransfer: DataTransfer | null) {
    if (!dataTransfer?.items) return null
    for (const item of dataTransfer.items) {
      if (item.kind !== 'file' || typeof item.getAsFileSystemHandle !== 'function') continue
      try {
        const handle = await item.getAsFileSystemHandle()
        if (handle?.kind === 'file') return handle as FileSystemFileHandle
      } catch {
        /* 部分浏览器/来源不支持句柄 */
      }
    }
    return null
  }

  function parsePx(val: string) {
    const n = parseFloat(val)
    return Number.isFinite(n) ? n : 0
  }

  function isImgBlockEl(el: HTMLElement) {
    return el.classList.contains('block') && el.classList.contains('img')
  }

  /** 图片宽度写在内层 img 上，无 img 时写 block 本身 */
  function getImageWidthTarget(block: HTMLElement) {
    const img = block.querySelector('img') as HTMLImageElement | null
    return img ?? block
  }

  /** 图片块选中框对齐内层 img，句柄才能贴在图片边缘 */
  function getOverlayRectEl(el: HTMLElement) {
    if (el.tagName === 'IMG') return el
    if (isImgBlockEl(el)) {
      const img = el.querySelector('img')
      if (img) return img as HTMLElement
    }
    return el
  }

  /** 页面内容区宽度（.page 内可用宽），图片宽度百分比以此为基准 */
  function getPageContentWidth(el: HTMLElement) {
    const page = el.closest('.page') as HTMLElement | null
    return page?.clientWidth || el.clientWidth || 1
  }

  /** 解除 .block.img 外层 width/max-width 对图片的额外限制 */
  function normalizeImgBlockContainer(block: HTMLElement) {
    block.style.setProperty('width', '100%')
    block.style.removeProperty('max-width')
  }

  function readImgPageWidthPercent(img: HTMLElement, block: HTMLElement) {
    const pageW = getPageContentWidth(block)
    if (pageW <= 0) return 100
    const imgW = img.offsetWidth || parsePx(getComputedStyle(img).width)
    if (imgW <= 0) return readWidthPercent(img, block)
    return (imgW / pageW) * 100
  }

  function applyImgPageWidthPercent(
    img: HTMLElement,
    block: HTMLElement,
    pagePct: number,
    skipPanelRefresh?: boolean,
  ) {
    normalizeImgBlockContainer(block)
    const pct = Math.max(1, Math.round(pagePct))
    applyStyleKey(img, 'width', `${pct}%`, skipPanelRefresh)
    applyStyleKey(img, 'height', 'auto', skipPanelRefresh)
  }

  function getWidthDragTarget(el: HTMLElement) {
    return isImgBlockEl(el) ? getImageWidthTarget(el) : el
  }

  function readWidthDisplay(el: HTMLElement, parent?: HTMLElement | null) {
    const inline = el.style.width.trim()
    if (inline) return inline
    const parentEl = parent ?? el.parentElement
    const parentW = parentEl?.clientWidth ?? 0
    const elW = el.offsetWidth
    if (parentW > 0 && elW > 0) {
      return `${Math.round((elW / parentW) * 100)}%`
    }
    return ''
  }

  function readWidthPercent(el: HTMLElement, parent: HTMLElement) {
    const inline = el.style.width.trim()
    if (inline.endsWith('%')) {
      const n = parseFloat(inline)
      if (Number.isFinite(n)) return n
    }
    if (inline.endsWith('px')) {
      const parentW = parent.clientWidth || 1
      return (parsePx(inline) / parentW) * 100
    }
    const computed = getComputedStyle(el).width
    if (computed.endsWith('%')) {
      const n = parseFloat(computed)
      if (Number.isFinite(n)) return n
    }
    if (computed.endsWith('px')) {
      const parentW = parent.clientWidth || 1
      const px = parsePx(computed)
      if (parentW > 0 && px > 0) return (px / parentW) * 100
    }
    const parentW = parent.clientWidth || 1
    if (parentW <= 0) return 100
    const elW = el.offsetWidth
    if (elW <= 0) return 100
    return (elW / parentW) * 100
  }

  function readWidthPx(el: HTMLElement) {
    const inline = el.style.width.trim()
    if (inline.endsWith('px')) {
      const px = parsePx(inline)
      if (px > 0) return px
    }
    const w = el.offsetWidth
    return w > 0 ? w : 1
  }

  function toLogicalDelta(delta: number, scale: number) {
    return scale > 0 ? delta / scale : delta
  }

  function normalizeWidthInput(raw: string) {
    const val = raw.trim()
    if (!val) return ''
    if (val.endsWith('%') || val.endsWith('px')) return val
    const n = parseFloat(val)
    if (Number.isFinite(n)) return `${n}%`
    return val
  }

  function getBlockType(el: HTMLElement) {
    if (!el.classList.contains('block')) return null
    return BLOCK_TYPES.find((t) => el.classList.contains(t)) || 'block'
  }

  function getBlockTypeLabel(type: string | null) {
    if (!type) return '内容块'
    return BLOCK_TYPE_LABELS[type] ?? type
  }

  function getEditableLabel(el: HTMLElement) {
    if (el.classList.contains('page')) {
      const pageNum = el.getAttribute('data-page') || '?'
      const isCover = el.classList.contains('page--cover')
      return `${isCover ? '封面页' : '内容页'} · 第 ${pageNum} 页`
    }
    if (el.tagName === 'IMG' && el.closest('.block.img')) {
      const block = el.closest('.block.img') as HTMLElement
      const id = block.getAttribute('data-id') || ''
      return id ? `图片 · ${id}` : '图片'
    }
    const type = getBlockType(el)
    const id = el.getAttribute('data-id') || ''
    const typeLabel = getBlockTypeLabel(type)
    return id ? `${typeLabel} · ${id}` : typeLabel
  }

  function formatComputedHint(inline: string | undefined, computedVal: string, unit = '') {
    if (inline?.trim()) return ''
    const val = computedVal.trim()
    if (!val || val === '0px' || val === 'normal') return ''
    return `<span class="ed-hint">CSS 默认：${escapeHtml(val)}${unit}</span>`
  }

  function selectOptions(
    options: Array<{ value: string; label: string }>,
    current: string,
    normalize?: (v: string) => string,
  ) {
    const normalized = normalize ? normalize(current) : current
    return options
      .map(
        (opt) =>
          `<option value="${opt.value}" ${normalized === opt.value ? 'selected' : ''}>${opt.label}</option>`,
      )
      .join('')
  }

  function readStyleMap(el: HTMLElement) {
    const map: Record<string, string> = {}
    STYLE_KEYS.forEach((key) => {
      map[key] = el.style.getPropertyValue(key) || ''
    })
    return map
  }

  function applyStyleKey(
    el: HTMLElement,
    key: string,
    value: string | null | undefined,
    skipPanelRefresh?: boolean,
  ) {
    if (!skipPanelRefresh) beginContinuousEdit()
    if (value === '' || value == null) {
      el.style.removeProperty(key)
    } else {
      el.style.setProperty(key, value)
    }
    markDirty()
    updateOverlay()
    // 面板输入过程中整页重建会销毁 input 并抢焦点，导致数字框只能点 spinner
    if (!skipPanelRefresh && !isPanelInputFocused()) refreshPanelValues()
  }

  function cssColorToHex(color: string) {
    if (!color || color === 'transparent') return '#000000'
    const m = document.createElement('canvas').getContext('2d')
    if (!m) return '#000000'
    m.fillStyle = color
    const normalized = m.fillStyle
    if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized
    const tmp = document.createElement('div')
    tmp.style.color = color
    document.body.appendChild(tmp)
    const computed = getComputedStyle(tmp).color
    document.body.removeChild(tmp)
    const parts = computed.match(/\d+/g)
    if (!parts || parts.length < 3) return '#000000'
    return (
      '#' +
      parts
        .slice(0, 3)
        .map((n) => (+n).toString(16).padStart(2, '0'))
        .join('')
    )
  }

  function buildPanel(el: HTMLElement) {
    const isInnerImg = el.tagName === 'IMG' && !!el.closest('.block.img')
    const imgBlock = isInnerImg ? (el.closest('.block.img') as HTMLElement) : null
    const panelEl = isInnerImg && imgBlock ? imgBlock : el

    const styles = readStyleMap(panelEl)
    const computed = getComputedStyle(panelEl)
    const isPage = panelEl.classList.contains('page')
    const isCoverPage = isPage && panelEl.classList.contains('page--cover')
    const isImgBlock = isImgBlockEl(panelEl)
    const isTextBlock = panelEl.classList.contains('block') && !isImgBlock
    const imgWidthTarget = isImgBlock ? getImageWidthTarget(panelEl) : null
    const hasImg = isImgBlock && !!imgWidthTarget && imgWidthTarget.tagName === 'IMG'
    const imgWidthVal =
      imgWidthTarget && imgWidthTarget.tagName === 'IMG'
        ? `${Math.round(readImgPageWidthPercent(imgWidthTarget, panelEl))}%`
        : imgWidthTarget
          ? readWidthDisplay(imgWidthTarget, panelEl)
          : ''
    const hasInnerTags = isTextBlock && panelEl.innerHTML.trim() !== panelEl.textContent?.trim()
    const blockType = getBlockType(panelEl)
    const dataId = panelEl.getAttribute('data-id') || ''
    const dataPage = panelEl.getAttribute('data-page') || ''
    const cleanClass = panelEl.className.replace(/ ed-\S+/g, '').trim()
    const fontWeightVal = normalizeFontWeight(styles['font-weight'] || computed.fontWeight)
    const textAlignVal = styles['text-align'] || computed.textAlign

    panelBody.innerHTML = `
      <div class="ed-meta">
        <strong>${escapeHtml(getEditableLabel(isInnerImg ? el : panelEl))}</strong>
        ${isInnerImg ? '<br><span class="ed-hint">已选中内层图片，可清除图片或删除整块</span>' : ''}
        ${dataId ? `<br>块 ID：<code>${escapeHtml(dataId)}</code>` : ''}
        ${dataPage ? `<br>页码：<code>${escapeHtml(dataPage)}</code>` : ''}
        ${isCoverPage ? '<br><span class="ed-tag">封面页</span>' : ''}
        <br>元素：<code>&lt;div class="${escapeHtml(cleanClass)}"&gt;</code>
      </div>

      ${
        isTextBlock
          ? `
      <div class="ed-field">
        <label>${hasInnerTags ? '文本内容（含 HTML 强调）' : '文本内容'}</label>
        <textarea id="prop-text" placeholder="输入文字…">${escapeHtml(hasInnerTags ? panelEl.innerHTML.trim() : (panelEl.textContent?.trim() ?? ''))}</textarea>
      </div>`
          : ''
      }

      ${
        isImgBlock
          ? `
      <div class="ed-field">
        <label>占位提示文字</label>
        <input type="text" id="prop-placeholder" placeholder="点击上传图片"
          value="${escapeHtml(panelEl.getAttribute('data-placeholder') || '')}">
        ${hasImg ? '<span class="ed-hint">已上传图片，占位文字仅在无图时显示</span>' : ''}
      </div>
      <div class="ed-field-row">
        <div class="ed-field">
          <label>图片宽度</label>
          <input type="text" id="prop-img-width" placeholder="如 100% 或 70"
            value="${escapeHtml(imgWidthVal)}">
          <span class="ed-hint">相对页面内容区宽度；外层 .block.img 自动占满页宽</span>
        </div>
        <div class="ed-field">
          <label>最大宽度</label>
          <input type="text" id="prop-img-max-width" placeholder="如 800px"
            value="${escapeHtml(imgWidthTarget?.style.maxWidth || '')}">
        </div>
      </div>`
          : ''
      }

      <div class="ed-section-title">${isPage ? '页面排版' : '排版'}</div>

      ${
        isTextBlock || isPage
          ? `
      <div class="ed-field-row">
        <div class="ed-field">
          <label>字号 (px)</label>
          <input type="number" id="prop-font-size" min="8" max="200" step="1"
            value="${parsePx(styles['font-size'] || computed.fontSize)}">
          ${formatComputedHint(styles['font-size'], computed.fontSize)}
        </div>
        <div class="ed-field">
          <label>行高</label>
          <input type="text" id="prop-line-height" placeholder="如 1.6"
            value="${escapeHtml(styles['line-height'] || '')}">
          ${formatComputedHint(styles['line-height'], computed.lineHeight)}
        </div>
      </div>

      <div class="ed-field-row">
        <div class="ed-field">
          <label>字重</label>
          <select id="prop-font-weight">
            ${selectOptions(FONT_WEIGHT_OPTIONS, fontWeightVal)}
          </select>
        </div>
        <div class="ed-field">
          <label>对齐方式</label>
          <select id="prop-text-align">
            ${selectOptions(TEXT_ALIGN_OPTIONS, textAlignVal)}
          </select>
        </div>
      </div>

      <div class="ed-field">
        <label>字间距</label>
        <input type="text" id="prop-letter-spacing" placeholder="如 0 或 2px"
          value="${escapeHtml(styles['letter-spacing'] || '')}">
        ${formatComputedHint(styles['letter-spacing'], computed.letterSpacing)}
      </div>`
          : isImgBlock
            ? `
      <div class="ed-field">
        <label>对齐方式</label>
        <select id="prop-text-align">
          ${selectOptions(TEXT_ALIGN_OPTIONS, textAlignVal)}
        </select>
        <span class="ed-hint">配合 width% 可居中或缩进图片</span>
      </div>`
            : ''
      }

      <div class="ed-section-title">颜色</div>

      ${
        isTextBlock || isPage
          ? `
      <div class="ed-field-row">
        <div class="ed-field">
          <label>文字颜色</label>
          <input type="color" id="prop-color" value="${cssColorToHex(styles['color'] || computed.color)}">
          ${formatComputedHint(styles['color'], computed.color)}
        </div>
        <div class="ed-field">
          <label>${isPage ? '页面背景' : '背景颜色'}</label>
          <input type="color" id="prop-bg" value="${cssColorToHex(styles['background-color'] || computed.backgroundColor)}">
          ${formatComputedHint(styles['background-color'], computed.backgroundColor)}
        </div>
      </div>`
          : isImgBlock
            ? `
      <div class="ed-field">
        <label>背景颜色</label>
        <input type="color" id="prop-bg" value="${cssColorToHex(styles['background-color'] || computed.backgroundColor)}">
        ${formatComputedHint(styles['background-color'], computed.backgroundColor)}
      </div>`
            : ''
      }

      <div class="ed-section-title">间距</div>

      <div class="ed-field-row">
        <div class="ed-field">
          <label>上外边距 (px)</label>
          <input type="number" id="prop-margin-top" step="1"
            value="${parsePx(styles['margin-top'] || computed.marginTop)}">
          ${formatComputedHint(styles['margin-top'], computed.marginTop)}
          ${!isPage ? '<span class="ed-hint">与上一块的间距；请用下一块的上边距调节，勿改本块下边距</span>' : ''}
        </div>
      </div>

      ${
        !isPage
          ? `
      <div class="ed-field-row">
        <div class="ed-field">
          <label>左外边距 (px)</label>
          <input type="number" id="prop-margin-left" step="1"
            value="${parsePx(styles['margin-left'] || computed.marginLeft)}">
          ${formatComputedHint(styles['margin-left'], computed.marginLeft)}
        </div>
        <div class="ed-field">
          <label>右外边距 (px)</label>
          <input type="number" id="prop-margin-right" step="1"
            value="${parsePx(styles['margin-right'] || computed.marginRight)}">
          ${formatComputedHint(styles['margin-right'], computed.marginRight)}
        </div>
      </div>`
          : ''
      }

      <div class="ed-field-row">
        <div class="ed-field">
          <label>内边距</label>
          <input type="text" id="prop-padding" placeholder="如 24px 或 8px 12px"
            value="${escapeHtml(styles['padding'] || '')}">
          ${formatComputedHint(styles['padding'], computed.padding)}
        </div>
        <div class="ed-field">
          <label>圆角</label>
          <input type="text" id="prop-border-radius" placeholder="如 8px"
            value="${escapeHtml(styles['border-radius'] || '')}">
          ${formatComputedHint(styles['border-radius'], computed.borderRadius)}
        </div>
      </div>

      ${
        !isPage && !isImgBlock
          ? `
      <div class="ed-field-row">
        <div class="ed-field">
          <label>宽度</label>
          <input type="text" id="prop-width" placeholder="如 100%"
            value="${escapeHtml(styles['width'] || '')}">
          ${formatComputedHint(styles['width'], computed.width)}
        </div>
        <div class="ed-field">
          <label>最大宽度</label>
          <input type="text" id="prop-max-width" placeholder="如 900px"
            value="${escapeHtml(styles['max-width'] || '')}">
          ${formatComputedHint(styles['max-width'], computed.maxWidth)}
        </div>
      </div>`
          : ''
      }

      ${
        isPage
          ? `
      <div class="ed-field">
        <label>页面内边距</label>
        <input type="text" id="prop-page-padding" placeholder="如 96px 72px"
          value="${escapeHtml(panelEl.style.padding || '')}">
        <span class="ed-hint">覆盖 .page 默认 padding，留空则使用模板默认值</span>
      </div>`
          : ''
      }

      ${
        blockType
          ? `
      <div class="ed-section-title">块信息</div>
      <div class="ed-field">
        <label>块类型</label>
        <input type="text" readonly value="${escapeHtml(getBlockTypeLabel(blockType))} (${blockType})">
      </div>`
          : ''
      }

      ${
        !isPage
          ? `
      <div class="ed-btn-row">
        ${
          isImgBlock && hasImg
            ? `<button type="button" id="btn-clear-image" class="danger">清除图片</button>`
            : ''
        }
        <button type="button" id="btn-delete-block" class="danger">${isImgBlock ? '删除图片块' : '删除块'}</button>
      </div>`
          : ''
      }

      <div class="ed-btn-row">
        <button type="button" id="btn-clear-style">清除内联样式</button>
        <button type="button" id="btn-deselect">取消选中</button>
      </div>
    `

    if (isTextBlock) {
      const propText = document.getElementById('prop-text') as HTMLTextAreaElement | null
      propText?.addEventListener('input', (e) => {
        beginContinuousEdit()
        const target = e.target as HTMLTextAreaElement
        if (hasInnerTags) panelEl.innerHTML = target.value
        else panelEl.textContent = target.value
        markDirty()
        updateOverlay()
      })
    }

    if (isImgBlock) {
      const propPlaceholder = document.getElementById('prop-placeholder') as HTMLInputElement | null
      propPlaceholder?.addEventListener('input', () => {
        beginContinuousEdit()
        const val = propPlaceholder.value.trim()
        if (val) panelEl.setAttribute('data-placeholder', val)
        else panelEl.removeAttribute('data-placeholder')
        markDirty()
      })
    }

    if (isImgBlock && imgWidthTarget) {
      const propImgWidth = document.getElementById('prop-img-width') as HTMLInputElement | null
      propImgWidth?.addEventListener('input', () => {
        const raw = normalizeWidthInput(propImgWidth.value)
        const n = parseFloat(raw)
        if (!Number.isFinite(n)) return
        if (imgWidthTarget.tagName === 'IMG') {
          applyImgPageWidthPercent(imgWidthTarget, panelEl, n)
        } else {
          applyStyleKey(imgWidthTarget, 'width', raw)
        }
      })

      const propImgMaxWidth = document.getElementById('prop-img-max-width') as HTMLInputElement | null
      propImgMaxWidth?.addEventListener('input', () => {
        applyStyleKey(imgWidthTarget, 'max-width', propImgMaxWidth.value.trim())
      })
    }

    const bind = (id: string, key: string, fmt?: 'px') => {
      const node = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null
      if (!node) return
      const apply = (allowClear: boolean) => {
        let val = node.value.trim()
        if (fmt === 'px') {
          if (val === '' || val === '-') {
            if (allowClear) applyStyleKey(panelEl, key, '')
            return
          }
          const n = parseFloat(val)
          if (!Number.isFinite(n)) return
          val = `${n}px`
        }
        applyStyleKey(panelEl, key, val)
      }
      node.addEventListener('input', () => apply(false))
      node.addEventListener('change', () => apply(true))
    }

    bind('prop-font-size', 'font-size', 'px')
    bind('prop-line-height', 'line-height')
    bind('prop-font-weight', 'font-weight')
    bind('prop-text-align', 'text-align')
    bind('prop-letter-spacing', 'letter-spacing')
    bind('prop-color', 'color')
    bind('prop-bg', 'background-color')
    bind('prop-margin-top', 'margin-top', 'px')
    bind('prop-margin-left', 'margin-left', 'px')
    bind('prop-margin-right', 'margin-right', 'px')
    bind('prop-padding', 'padding')
    bind('prop-border-radius', 'border-radius')
    bind('prop-width', 'width')
    bind('prop-max-width', 'max-width')

    const pagePad = document.getElementById('prop-page-padding') as HTMLInputElement | null
    pagePad?.addEventListener('input', () => applyStyleKey(panelEl, 'padding', pagePad.value))

    document.getElementById('btn-clear-style')!.onclick = () => {
      pushHistoryNow()
      panelEl.removeAttribute('style')
      markDirty()
      selectElement(isInnerImg ? el : panelEl)
    }

    document.getElementById('btn-deselect')!.onclick = deselect

    document.getElementById('btn-clear-image')?.addEventListener('click', () => {
      if (!isImgBlock) return
      clearImageFromBlock(panelEl)
    })

    document.getElementById('btn-delete-block')?.addEventListener('click', () => {
      if (isPage) return
      if (isImgBlock && hasImg && !confirm('确定删除此图片块？')) return
      pushHistoryNow()
      panelEl.remove()
      deselect()
      markDirty()
    })
  }

  function refreshPanelValues() {
    if (selected) buildPanel(selected)
  }

  function updateOverlay() {
    if (!selected) {
      overlay.classList.remove('visible')
      return
    }

    const rectEl = getOverlayRectEl(selected)
    const rect = rectEl.getBoundingClientRect()
    const wrapRect = canvasWrap.getBoundingClientRect()
    const scrollL = canvasWrap.scrollLeft
    const scrollT = canvasWrap.scrollTop

    overlay.classList.add('visible')
    overlay.style.left = `${rect.left - wrapRect.left + scrollL}px`
    overlay.style.top = `${rect.top - wrapRect.top + scrollT}px`
    overlay.style.width = `${rect.width}px`
    overlay.style.height = `${rect.height}px`

    selBox.style.width = '100%'
    selBox.style.height = '100%'
    selLabel.textContent = getEditableLabel(selected)
    updateOverlayHandles()
  }

  function updateOverlayHandles() {
    if (!selected) return

    const isPage = selected.classList.contains('page')
    const isImg =
      selected.tagName === 'IMG' || isImgBlockEl(selected)

    const wHandle = overlay.querySelector('.ed-handle-w') as HTMLElement | null
    const nHandle = overlay.querySelector('.ed-handle-n') as HTMLElement | null
    const eHandle = overlay.querySelector('.ed-handle-e') as HTMLElement | null
    const delBtn = overlay.querySelector('.ed-sel-delete') as HTMLElement | null

    if (wHandle) {
      wHandle.style.display = isPage ? 'none' : ''
      wHandle.title = '拖动调整水平位置 (margin-left)'
    }
    if (nHandle) {
      nHandle.style.display = isPage ? 'none' : ''
      nHandle.title = '拖动调整垂直位置 (margin-top)'
    }
    if (eHandle) {
      eHandle.style.display = isPage ? 'none' : ''
      eHandle.title = isImg ? '拖动调整图片宽度（锁定宽高比）' : '拖动调整宽度 (width)'
    }
    if (delBtn) {
      delBtn.style.display = isPage ? 'none' : ''
    }
  }

  function isPanelInputFocused() {
    const el = document.activeElement
    if (!el) return false
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
  }

  function restoreImgPlaceholder(block: HTMLElement) {
    block.querySelector('.placeholder-hint')?.remove()
    const text = block.getAttribute('data-placeholder')?.trim()
    if (!text) return
    const hint = document.createElement('span')
    hint.className = 'placeholder-hint'
    hint.textContent = text
    block.appendChild(hint)
  }

  /** 清除图片块内的 img，保留占位块 */
  function clearImageFromBlock(block: HTMLElement) {
    pushHistoryNow()
    block.querySelector('img')?.remove()
    block.style.removeProperty('width')
    block.style.removeProperty('max-width')
    restoreImgPlaceholder(block)
    markDirty()
    selectElement(block)
  }

  function deleteSelectedElement() {
    if (!selected) return

    const isPage = selected.classList.contains('page')
    const isInnerImg =
      selected.tagName === 'IMG' && !!selected.closest('.block.img')
    const block = isInnerImg
      ? (selected.closest('.block.img') as HTMLElement)
      : selected.classList.contains('block')
        ? selected
        : null

    if (isPage || !block) return

    if (isInnerImg) {
      clearImageFromBlock(block)
      return
    }

    if (isImgBlockEl(block) && block.querySelector('img')) {
      if (!confirm('确定删除此图片块？')) return
    }

    pushHistoryNow()
    block.remove()
    deselect()
    markDirty()
  }

  function deselect() {
    if (selected) selected.classList.remove('ed-selected')
    selected = null
    overlay.classList.remove('visible')
    panelBody.innerHTML = `<p class="ed-panel-empty">点击页面或内容块进行编辑。<br><br>
      左/上/右三个句柄：水平位置、垂直间距、宽度（图片锁定宽高比）。字号等可在属性面板修改。<br><br>
      修改会写入元素的内联 style，保存后写回 HTML。<br>
      <span class="ed-hint">Ctrl+Z 撤销 · Ctrl+Shift+Z 重做</span></p>`
  }

  function selectElement(el: HTMLElement) {
    if (selected) selected.classList.remove('ed-selected')
    selected = el
    selected.classList.add('ed-selected')
    buildPanel(el)
    updateOverlay()
  }

  function findEditable(target: EventTarget | null) {
    let node = target as HTMLElement | null
    while (node && node !== docEl) {
      if (node.tagName === 'IMG' && node.closest('.block.img')) return node
      if (node.classList?.contains('block') || node.classList?.contains('page')) return node
      node = node.parentElement
    }
    return null
  }

  function setupCanvasEvents() {
    on(docEl, 'mouseover', (e) => {
      const el = findEditable(e.target)
      if (el && el !== selected) el.classList.add('ed-hover')
    })
    on(docEl, 'mouseout', (e) => {
      const event = e as MouseEvent
      const el = findEditable(event.target)
      if (!el) return
      const to = event.relatedTarget as Node | null
      if (to && el.contains(to)) return
      el.classList.remove('ed-hover')
    })
    on(docEl, 'click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const el = findEditable(e.target)
      if (el) selectElement(el)
      else deselect()
    })
  }

  function getDragSubject(el: HTMLElement) {
    if (el.tagName === 'IMG') {
      return (el.closest('.block.img') as HTMLElement | null) ?? el
    }
    return el
  }

  function startDrag(handle: string, e: MouseEvent) {
    if (!selected) return
    e.preventDefault()
    e.stopPropagation()

    pushHistoryNow()
    historyPaused = true

    const subject = getDragSubject(selected)
    const cs = getComputedStyle(subject)
    const widthTarget = getWidthDragTarget(subject)
    const previewScale = getPreviewScale(canvasWrap)
    if (isImgBlockEl(subject) && handle === 'width') {
      normalizeImgBlockContainer(subject)
    }
    const imgWidthTarget = isImgBlockEl(subject) ? getImageWidthTarget(subject) : null
    dragState = {
      handle,
      startY: e.clientY,
      startX: e.clientX,
      marginTop: parsePx(subject.style.marginTop || cs.marginTop),
      marginLeft: parsePx(subject.style.marginLeft || cs.marginLeft),
      startWidthPct:
        isImgBlockEl(subject) && imgWidthTarget?.tagName === 'IMG'
          ? readImgPageWidthPercent(imgWidthTarget, subject)
          : readWidthPercent(widthTarget, subject),
      widthParentPx: isImgBlockEl(subject)
        ? getPageContentWidth(subject)
        : subject.parentElement?.clientWidth || subject.clientWidth || 1,
      startWidthPx: readWidthPx(subject),
      previewScale,
    }

    document.addEventListener('mousemove', onDrag)
    document.addEventListener('mouseup', endDrag)
  }

  function applyWidthDrag(logicalDx: number, skipPanelRefresh?: boolean) {
    if (!selected || !dragState) return

    const subject = getDragSubject(selected)

    if (isImgBlockEl(subject)) {
      const target = getImageWidthTarget(subject)
      if (target.tagName === 'IMG') {
        const pageW = dragState.widthParentPx || 1
        const pctDelta = (logicalDx / pageW) * 100
        const pagePct = dragState.startWidthPct + pctDelta
        applyImgPageWidthPercent(target, subject, pagePct, skipPanelRefresh)
        return
      }
      const parentW = dragState.widthParentPx || 1
      const pctDelta = (logicalDx / parentW) * 100
      const pct = Math.max(1, Math.round(dragState.startWidthPct + pctDelta))
      applyStyleKey(target, 'width', `${pct}%`, skipPanelRefresh)
      return
    }

    const newWidth = Math.max(0, Math.round(dragState.startWidthPx + logicalDx))
    applyStyleKey(subject, 'width', `${newWidth}px`, skipPanelRefresh)
    const maxInline = subject.style.maxWidth.trim()
    if (maxInline && maxInline !== 'none') {
      const maxPx = parsePx(maxInline)
      if (maxPx > 0 && maxPx < newWidth) {
        applyStyleKey(subject, 'max-width', `${newWidth}px`, skipPanelRefresh)
      }
    }
  }

  function onDrag(e: MouseEvent) {
    if (!dragState || !selected) return
    const subject = getDragSubject(selected)
    const dy = e.clientY - dragState.startY
    const dx = e.clientX - dragState.startX
    const logicalDy = toLogicalDelta(dy, dragState.previewScale)
    const logicalDx = toLogicalDelta(dx, dragState.previewScale)

    const skip = true
    switch (dragState.handle) {
      case 'margin-top':
        applyStyleKey(
          subject,
          'margin-top',
          `${Math.round(dragState.marginTop + logicalDy)}px`,
          skip,
        )
        break
      case 'margin-left':
        applyStyleKey(
          subject,
          'margin-left',
          `${Math.round(dragState.marginLeft + logicalDx)}px`,
          skip,
        )
        break
      case 'width':
        applyWidthDrag(logicalDx, skip)
        break
      default:
        break
    }
  }

  function endDrag() {
    dragState = null
    historyPaused = false
    document.removeEventListener('mousemove', onDrag)
    document.removeEventListener('mouseup', endDrag)
    if (selected) refreshPanelValues()
  }

  overlay.querySelectorAll('.ed-handle').forEach((h) => {
    h.addEventListener('mousedown', (e) => startDrag((h as HTMLElement).dataset.handle!, e as MouseEvent))
  })

  const selDeleteBtn = overlay.querySelector('.ed-sel-delete') as HTMLButtonElement | null
  selDeleteBtn?.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    deleteSelectedElement()
  })

  on(canvasWrap, 'scroll', updateOverlay)
  on(window, 'resize', updateOverlay)

  function extractTemplateStyles(doc: Document) {
    return [...doc.querySelectorAll('style')]
      .map((s) => s.textContent)
      .join('\n')
      .replace(/body\s*\{[^}]*\}/g, '/* body styles omitted in editor */')
  }

  function renderFromDoc(doc: Document) {
    const docNode = doc.getElementById('doc')
    if (!docNode) {
      alert('未找到 #doc，请确认是 TextToPic 模板 HTML')
      return false
    }

    tplStyles.textContent = extractTemplateStyles(doc)
    docEl.innerHTML = docNode.innerHTML
    docEl.hidden = false
    emptyState.hidden = true

    deselect()
    return true
  }

  async function loadHtmlText(text: string, name: string, handle: FileSystemFileHandle | null) {
    sourceDoc = new DOMParser().parseFromString(text, 'text/html')
    if (!renderFromDoc(sourceDoc)) return

    await resolveAssetsInDoc(docEl)

    fileName = name || 'document.html'
    dirty = false
    clearHistoryStacks()

    if (handle) {
      fileHandle = (await verifyHandleWrite(handle)) || handle
    } else {
      fileHandle = null
    }

    updateSaveButtons()
    refreshFileStatus()
  }

  function isHtmlFile(file: File) {
    const name = (file.name || '').toLowerCase()
    return name.endsWith('.html') || name.endsWith('.htm') || file.type === 'text/html'
  }

  async function loadFromFile(file: File, handle: FileSystemFileHandle | null) {
    if (!file || !isHtmlFile(file)) {
      alert('请拖入 .html 文件')
      return
    }
    if (dirty && !confirm('有未保存修改，确定加载新文件？')) return
    await loadHtmlText(await file.text(), file.name, handle)
  }

  function bindDragDrop(target: HTMLElement) {
    let depth = 0

    target.addEventListener('dragenter', (e) => {
      e.preventDefault()
      depth += 1
      target.classList.add('ed-drag-over')
    })

    target.addEventListener('dragover', (e) => {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'copy'
    })

    target.addEventListener('dragleave', (e) => {
      e.preventDefault()
      depth -= 1
      if (depth <= 0) {
        depth = 0
        target.classList.remove('ed-drag-over')
      }
    })

    target.addEventListener('drop', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      depth = 0
      target.classList.remove('ed-drag-over')
      document.body.classList.remove('ed-drag-over')

      const handle = await getHandleFromDataTransfer(e.dataTransfer)
      const file = handle ? await handle.getFile() : [...e.dataTransfer!.files].find(isHtmlFile)

      if (!file || !isHtmlFile(file)) {
        alert('请拖入 .html 文件')
        return
      }
      await loadFromFile(file, handle)
    })
  }

  function stripEditorClasses(root: HTMLElement) {
    root.querySelectorAll('.ed-hover, .ed-selected').forEach((el) => {
      el.classList.remove('ed-hover', 'ed-selected')
    })
  }

  function syncToSourceDoc() {
    stripEditorClasses(docEl)
    const liveDoc = sourceDoc?.getElementById('doc')
    if (!liveDoc) return
    liveDoc.innerHTML = docEl.innerHTML
  }

  function serializeHtml(): string | null {
    if (!sourceDoc) return null
    syncToSourceDoc()
    const dt = sourceDoc.doctype
    const doctypeStr = dt
      ? `<!DOCTYPE ${dt.name}${dt.publicId ? ` PUBLIC "${dt.publicId}"` : ''}${dt.systemId ? ` "${dt.systemId}"` : ''}>`
      : '<!DOCTYPE html>'
    return restoreAssetRefsInHtml(doctypeStr + '\n' + sourceDoc.documentElement.outerHTML)
  }

  async function saveToFile() {
    const html = serializeHtml()
    if (!html) return

    try {
      const handle = await ensureWriteHandle()
      const writable = await handle.createWritable()
      await writable.write(html)
      await writable.close()
      markClean()
      setStatus(`${fileName} · 已写回源文件`, false)
    } catch (err) {
      const error = err as Error & { name?: string }
      if (error.name === 'AbortError') return
      alert('保存失败：' + error.message)
    }
  }

  function downloadHtml(html?: string) {
    const content = html || serializeHtml()
    if (!content) return
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName || 'template.html'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function openWithPicker() {
    if (!supportsFileSystemAccess()) {
      fileInput.click()
      return
    }

    try {
      const [handle] = await window.showOpenFilePicker({
        mode: 'readwrite',
        types: PICKER_TYPES,
        multiple: false,
      })
      if (!handle) return
      const granted = await verifyHandleWrite(handle)
      if (!granted) {
        alert('需要授予文件写入权限才能写回源文件')
        return
      }
      const file = await handle.getFile()
      await loadFromFile(file, handle)
    } catch (err) {
      const error = err as Error & { name?: string }
      if (error.name !== 'AbortError') alert('打开失败：' + error.message)
    }
  }

  on(fileInput, 'change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = ''
    if (!file) return
    await loadFromFile(file, null)
  })

  bindDragDrop(canvasWrap)
  setupCanvasEvents()

  on(document.body, 'dragenter', (e) => {
    const event = e as DragEvent
    if ([...(event.dataTransfer?.types || [])].includes('Files')) {
      event.preventDefault()
      document.body.classList.add('ed-drag-over')
    }
  })
  on(document.body, 'dragover', (e) => {
    const event = e as DragEvent
    if ([...(event.dataTransfer?.types || [])].includes('Files')) {
      event.preventDefault()
      event.dataTransfer!.dropEffect = 'copy'
    }
  })
  on(document.body, 'dragleave', (e) => {
    const event = e as Event
    if (event.target === document.body || (event as MouseEvent).relatedTarget === null) {
      document.body.classList.remove('ed-drag-over')
    }
  })
  on(document.body, 'drop', async (e) => {
    const event = e as DragEvent
    if ((event.target as HTMLElement).closest('#canvas-wrap')) return
    event.preventDefault()
    document.body.classList.remove('ed-drag-over')
    const handle = await getHandleFromDataTransfer(event.dataTransfer)
    const file = handle ? await handle.getFile() : [...(event.dataTransfer?.files || [])].find(isHtmlFile)
    if (!file) return
    await loadFromFile(file, handle)
  })

  const btnOpen = document.getElementById('btn-open')
  const btnSave = document.getElementById('btn-save')
  const btnDownload = document.getElementById('btn-download')
  btnOpen?.addEventListener('click', openWithPicker)
  btnSave?.addEventListener('click', saveToFile)
  btnDownload?.addEventListener('click', () => downloadHtml())

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') deselect()
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !isPanelInputFocused()) {
      e.preventDefault()
      deleteSelectedElement()
    }
    if ((e.ctrlKey || e.metaKey) && !isPanelInputFocused()) {
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault()
        redo()
        return
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      if (sourceDoc) saveToFile()
    }
  }
  on(document, 'keydown', onKeydown as EventListener)

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (dirty) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  on(window, 'beforeunload', onBeforeUnload as EventListener)

  updateSaveButtons()

  if (articleMode) {
    emptyState.hidden = true
  }

  const destroy = () => {
    cleanups.forEach((fn) => fn())
    clearInputHistoryTimer()
    document.removeEventListener('mousemove', onDrag)
    document.removeEventListener('mouseup', endDrag)
    document.body.classList.remove('ed-drag-over')
    tplStyles.remove()
  }

  return {
    destroy,
    loadHtml: (text: string, name?: string) => loadHtmlText(text, name || 'document.html', null),
    serializeHtml,
    isDirty: () => dirty,
    markClean,
    refreshStatus: refreshFileStatus,
  }
}
