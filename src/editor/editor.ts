/**
 * TextToPic 可视化编辑器
 * 上传/打开 template.html → 点选 .page / .block → 句柄 + 面板改 style → 写回源文件
 */

const STYLE_KEYS = [
  'font-size',
  'color',
  'font-weight',
  'line-height',
  'letter-spacing',
  'margin-top',
  'margin-bottom',
  'padding',
  'background-color',
  'text-align',
  'border-radius',
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
    marginBottom: number
    fontSize: number
    padding: number
  } | null = null

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

  function applyStyleKey(el: HTMLElement, key: string, value: string | null | undefined, skipPanelRefresh?: boolean) {
    if (value === '' || value == null) {
      el.style.removeProperty(key)
    } else {
      el.style.setProperty(key, value)
    }
    markDirty()
    updateOverlay()
    if (!skipPanelRefresh) refreshPanelValues()
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
    const styles = readStyleMap(el)
    const computed = getComputedStyle(el)
    const isPage = el.classList.contains('page')
    const isCoverPage = isPage && el.classList.contains('page--cover')
    const isImgBlock = el.classList.contains('block') && el.classList.contains('img')
    const isTextBlock = el.classList.contains('block') && !isImgBlock
    const hasInnerTags = isTextBlock && el.innerHTML.trim() !== el.textContent?.trim()
    const blockType = getBlockType(el)
    const dataId = el.getAttribute('data-id') || ''
    const dataPage = el.getAttribute('data-page') || ''
    const cleanClass = el.className.replace(/ ed-\S+/g, '').trim()
    const fontWeightVal = normalizeFontWeight(styles['font-weight'] || computed.fontWeight)
    const textAlignVal = styles['text-align'] || computed.textAlign

    panelBody.innerHTML = `
      <div class="ed-meta">
        <strong>${escapeHtml(getEditableLabel(el))}</strong>
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
        <textarea id="prop-text" placeholder="输入文字…">${escapeHtml(hasInnerTags ? el.innerHTML.trim() : (el.textContent?.trim() ?? ''))}</textarea>
      </div>`
          : ''
      }

      ${
        isImgBlock
          ? `
      <div class="ed-field">
        <label>占位提示文字</label>
        <input type="text" id="prop-placeholder" placeholder="点击上传图片"
          value="${escapeHtml(el.getAttribute('data-placeholder') || '')}">
        ${el.querySelector('img') ? '<span class="ed-hint">已上传图片，占位文字仅在无图时显示</span>' : ''}
      </div>`
          : ''
      }

      <div class="ed-section-title">${isPage ? '页面排版' : '排版'}</div>

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
      </div>

      <div class="ed-section-title">颜色</div>

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
      </div>

      <div class="ed-section-title">间距</div>

      <div class="ed-field-row">
        <div class="ed-field">
          <label>上外边距 (px)</label>
          <input type="number" id="prop-margin-top" step="1"
            value="${parsePx(styles['margin-top'] || computed.marginTop)}">
          ${formatComputedHint(styles['margin-top'], computed.marginTop)}
        </div>
        <div class="ed-field">
          <label>下外边距 (px)</label>
          <input type="number" id="prop-margin-bottom" step="1"
            value="${parsePx(styles['margin-bottom'] || computed.marginBottom)}">
          ${formatComputedHint(styles['margin-bottom'], computed.marginBottom)}
        </div>
      </div>

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
        isPage
          ? `
      <div class="ed-field">
        <label>页面内边距</label>
        <input type="text" id="prop-page-padding" placeholder="如 96px 72px"
          value="${escapeHtml(el.style.padding || '')}">
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

      <div class="ed-btn-row">
        <button type="button" id="btn-clear-style">清除内联样式</button>
        <button type="button" id="btn-deselect">取消选中</button>
      </div>
    `

    if (isTextBlock) {
      const propText = document.getElementById('prop-text') as HTMLTextAreaElement | null
      propText?.addEventListener('input', (e) => {
        const target = e.target as HTMLTextAreaElement
        if (hasInnerTags) el.innerHTML = target.value
        else el.textContent = target.value
        markDirty()
        updateOverlay()
      })
    }

    if (isImgBlock) {
      const propPlaceholder = document.getElementById('prop-placeholder') as HTMLInputElement | null
      propPlaceholder?.addEventListener('input', () => {
        const val = propPlaceholder.value.trim()
        if (val) el.setAttribute('data-placeholder', val)
        else el.removeAttribute('data-placeholder')
        markDirty()
      })
    }

    const bind = (id: string, key: string, fmt?: 'px') => {
      const node = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null
      if (!node) return
      const handler = () => {
        let val = node.value
        if (fmt === 'px' && val !== '') val = `${val}px`
        applyStyleKey(el, key, val)
      }
      node.addEventListener('input', handler)
      node.addEventListener('change', handler)
    }

    bind('prop-font-size', 'font-size', 'px')
    bind('prop-line-height', 'line-height')
    bind('prop-font-weight', 'font-weight')
    bind('prop-text-align', 'text-align')
    bind('prop-letter-spacing', 'letter-spacing')
    bind('prop-color', 'color')
    bind('prop-bg', 'background-color')
    bind('prop-margin-top', 'margin-top', 'px')
    bind('prop-margin-bottom', 'margin-bottom', 'px')
    bind('prop-padding', 'padding')
    bind('prop-border-radius', 'border-radius')

    const pagePad = document.getElementById('prop-page-padding') as HTMLInputElement | null
    pagePad?.addEventListener('input', () => applyStyleKey(el, 'padding', pagePad.value))

    document.getElementById('btn-clear-style')!.onclick = () => {
      el.removeAttribute('style')
      markDirty()
      selectElement(el)
    }

    document.getElementById('btn-deselect')!.onclick = deselect
  }

  function refreshPanelValues() {
    if (selected) buildPanel(selected)
  }

  function updateOverlay() {
    if (!selected) {
      overlay.classList.remove('visible')
      return
    }

    const rect = selected.getBoundingClientRect()
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
  }

  function deselect() {
    if (selected) selected.classList.remove('ed-selected')
    selected = null
    overlay.classList.remove('visible')
    panelBody.innerHTML = `<p class="ed-panel-empty">点击页面或内容块进行编辑。<br><br>
      拖动选中框上的句柄可快速调整间距与字号；右侧面板可修改颜色、对齐等样式。<br><br>
      修改会写入元素的内联 style，保存后写回 HTML。</p>`
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
      if (node.classList?.contains('block') || node.classList?.contains('page')) return node
      node = node.parentElement
    }
    return null
  }

  function bindCanvasEvents() {
    docEl.querySelectorAll('.page, .block').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        if (el !== selected) el.classList.add('ed-hover')
      })
      el.addEventListener('mouseleave', () => el.classList.remove('ed-hover'))
    })

    docEl.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const el = findEditable(e.target)
      if (el) selectElement(el)
      else deselect()
    })
  }

  function startDrag(handle: string, e: MouseEvent) {
    if (!selected) return
    e.preventDefault()
    e.stopPropagation()

    const cs = getComputedStyle(selected)
    dragState = {
      handle,
      startY: e.clientY,
      startX: e.clientX,
      marginTop: parsePx(selected.style.marginTop || cs.marginTop),
      marginBottom: parsePx(selected.style.marginBottom || cs.marginBottom),
      fontSize: parsePx(selected.style.fontSize || cs.fontSize),
      padding: parsePx(selected.style.paddingTop || cs.paddingTop),
    }

    document.addEventListener('mousemove', onDrag)
    document.addEventListener('mouseup', endDrag)
  }

  function onDrag(e: MouseEvent) {
    if (!dragState || !selected) return
    const dy = e.clientY - dragState.startY
    const dx = e.clientX - dragState.startX

    const skip = true
    switch (dragState.handle) {
      case 'margin-top':
        applyStyleKey(selected, 'margin-top', `${Math.max(0, Math.round(dragState.marginTop + dy))}px`, skip)
        break
      case 'margin-bottom':
        applyStyleKey(selected, 'margin-bottom', `${Math.max(0, Math.round(dragState.marginBottom + dy))}px`, skip)
        break
      case 'font-size': {
        const delta = Math.round((dy + dx) * 0.4)
        applyStyleKey(selected, 'font-size', `${Math.max(8, Math.round(dragState.fontSize + delta))}px`, skip)
        break
      }
      case 'padding': {
        const p = Math.max(0, Math.round(dragState.padding - dy * 0.5))
        applyStyleKey(selected, 'padding', `${p}px`, skip)
        break
      }
      default:
        break
    }
  }

  function endDrag() {
    dragState = null
    document.removeEventListener('mousemove', onDrag)
    document.removeEventListener('mouseup', endDrag)
    if (selected) refreshPanelValues()
  }

  overlay.querySelectorAll('.ed-handle').forEach((h) => {
    h.addEventListener('mousedown', (e) => startDrag((h as HTMLElement).dataset.handle!, e as MouseEvent))
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

    bindCanvasEvents()
    deselect()
    return true
  }

  async function loadHtmlText(text: string, name: string, handle: FileSystemFileHandle | null) {
    sourceDoc = new DOMParser().parseFromString(text, 'text/html')
    if (!renderFromDoc(sourceDoc)) return

    fileName = name || 'document.html'
    dirty = false

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
    return doctypeStr + '\n' + sourceDoc.documentElement.outerHTML
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
