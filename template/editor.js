/**
 * TextToPic 可视化编辑器
 * 上传/打开 template.html → 点选 .page / .block → 句柄 + 面板改 style → 写回源文件
 */
(function () {
  'use strict';

  const STYLE_KEYS = [
    'font-size', 'color', 'font-weight', 'line-height', 'letter-spacing',
    'margin-top', 'margin-bottom', 'padding', 'background-color',
    'text-align', 'border-radius',
  ];

  const BLOCK_TYPES = ['cover-title', 'cover-sub', 'cover-tag', 'h1', 'h2', 'text', 'li', 'quote', 'img'];

  const canvasWrap = document.getElementById('canvas-wrap');
  const emptyState = document.getElementById('empty-state');
  const docEl = document.getElementById('doc');
  const tplStyles = document.getElementById('tpl-styles');
  const overlay = document.getElementById('ed-overlay');
  const selBox = document.getElementById('sel-box');
  const selLabel = document.getElementById('sel-label');
  const panelBody = document.getElementById('panel-body');
  const statusEl = document.getElementById('status');
  const fileInput = document.getElementById('file-input');

  let sourceDoc = null;
  let fileHandle = null;
  let fileName = '';
  let dirty = false;
  let selected = null;
  let dragState = null;

  const PICKER_TYPES = [{ description: 'HTML', accept: { 'text/html': ['.html', '.htm'] } }];

  function supportsFileSystemAccess() {
    return typeof window.showOpenFilePicker === 'function';
  }

  function refreshFileStatus() {
    if (!fileName) {
      setStatus('请打开 / 拖拽 template.html', false);
      return;
    }
    if (dirty) {
      setStatus(
        fileHandle
          ? `${fileName} · 有未保存修改（可写回）`
          : `${fileName} · 有未保存修改（保存时将请求写权限）`,
        true
      );
      return;
    }
    setStatus(
      fileHandle ? `${fileName} · 已绑定句柄，可直接写回` : `${fileName} · 已加载`,
      false
    );
  }

  function updateSaveButtons() {
    document.getElementById('btn-save').disabled = !sourceDoc;
    document.getElementById('btn-download').disabled = !sourceDoc;
  }

  function setStatus(msg, isDirty) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('dirty', !!isDirty);
  }

  function markDirty() {
    dirty = true;
    updateSaveButtons();
    refreshFileStatus();
  }

  function markClean() {
    dirty = false;
    refreshFileStatus();
  }

  async function verifyHandleWrite(handle) {
    if (!handle) return null;
    try {
      let perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        perm = await handle.requestPermission({ mode: 'readwrite' });
      }
      return perm === 'granted' ? handle : null;
    } catch {
      return null;
    }
  }

  async function ensureWriteHandle() {
    if (fileHandle) {
      const ok = await verifyHandleWrite(fileHandle);
      if (ok) return ok;
    }

    if (!supportsFileSystemAccess()) {
      throw new Error('当前浏览器不支持 File System Access API，请使用 Chrome / Edge，并通过「打开 HTML」或拖拽本地文件加载');
    }

    const [handle] = await window.showOpenFilePicker({
      mode: 'readwrite',
      types: PICKER_TYPES,
      multiple: false,
    });

    const granted = await verifyHandleWrite(handle);
    if (!granted) {
      throw new Error('未获得文件写入权限');
    }

    fileHandle = handle;
    fileName = handle.name;
    refreshFileStatus();
    return handle;
  }

  async function getHandleFromDataTransfer(dataTransfer) {
    if (!dataTransfer?.items) return null;
    for (const item of dataTransfer.items) {
      if (item.kind !== 'file' || typeof item.getAsFileSystemHandle !== 'function') continue;
      try {
        const handle = await item.getAsFileSystemHandle();
        if (handle?.kind === 'file') return handle;
      } catch {
        /* 部分浏览器/来源不支持句柄 */
      }
    }
    return null;
  }

  function parsePx(val) {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : 0;
  }

  function getBlockType(el) {
    if (!el.classList.contains('block')) return null;
    return BLOCK_TYPES.find((t) => el.classList.contains(t)) || 'block';
  }

  function getEditableLabel(el) {
    if (el.classList.contains('page')) {
      return `页面 · 第 ${el.getAttribute('data-page') || '?'} 页`;
    }
    const type = getBlockType(el);
    const id = el.getAttribute('data-id') || '';
    return `${type || 'block'}${id ? ` · ${id}` : ''}`;
  }

  function readStyleMap(el) {
    const map = {};
    STYLE_KEYS.forEach((key) => {
      map[key] = el.style.getPropertyValue(key) || '';
    });
    return map;
  }

  function applyStyleKey(el, key, value, skipPanelRefresh) {
    if (value === '' || value == null) {
      el.style.removeProperty(key);
    } else {
      el.style.setProperty(key, value);
    }
    markDirty();
    updateOverlay();
    if (!skipPanelRefresh) refreshPanelValues();
  }

  function cssColorToHex(color) {
    if (!color || color === 'transparent') return '#000000';
    const m = document.createElement('canvas').getContext('2d');
    if (!m) return '#000000';
    m.fillStyle = color;
    const normalized = m.fillStyle;
    if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized;
    const tmp = document.createElement('div');
    tmp.style.color = color;
    document.body.appendChild(tmp);
    const computed = getComputedStyle(tmp).color;
    document.body.removeChild(tmp);
    const parts = computed.match(/\d+/g);
    if (!parts || parts.length < 3) return '#000000';
    return '#' + parts.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('');
  }

  function buildPanel(el) {
    const styles = readStyleMap(el);
    const computed = getComputedStyle(el);
    const isPage = el.classList.contains('page');
    const isTextBlock = el.classList.contains('block') && !el.classList.contains('img');
    const hasInnerTags = isTextBlock && el.innerHTML.trim() !== el.textContent.trim();

    panelBody.innerHTML = `
      <div class="ed-meta">
        <strong>${getEditableLabel(el)}</strong><br>
        标签：&lt;div class="${el.className.replace(/ ed-\S+/g, '')}"&gt;
      </div>

      ${isTextBlock ? `
      <div class="ed-field">
        <label>${hasInnerTags ? 'HTML 内容（含 span 强调）' : '文本内容'}</label>
        <textarea id="prop-text">${hasInnerTags ? el.innerHTML.trim() : el.textContent.trim()}</textarea>
      </div>` : ''}

      <div class="ed-section-title">排版</div>

      <div class="ed-field-row">
        <div class="ed-field">
          <label>font-size (px)</label>
          <input type="number" id="prop-font-size" min="8" max="200" step="1"
            value="${parsePx(styles['font-size'] || computed.fontSize)}">
        </div>
        <div class="ed-field">
          <label>line-height</label>
          <input type="text" id="prop-line-height" placeholder="1.6"
            value="${styles['line-height'] || ''}">
        </div>
      </div>

      <div class="ed-field-row">
        <div class="ed-field">
          <label>font-weight</label>
          <select id="prop-font-weight">
            ${['', '400', '500', '600', '700', '800'].map((w) =>
              `<option value="${w}" ${(styles['font-weight'] || computed.fontWeight) == w ? 'selected' : ''}>${w || '默认'}</option>`
            ).join('')}
          </select>
        </div>
        <div class="ed-field">
          <label>text-align</label>
          <select id="prop-text-align">
            ${['', 'left', 'center', 'right'].map((a) =>
              `<option value="${a}" ${(styles['text-align'] || computed.textAlign) === a ? 'selected' : ''}>${a || '默认'}</option>`
            ).join('')}
          </select>
        </div>
      </div>

      <div class="ed-field">
        <label>letter-spacing (px)</label>
        <input type="text" id="prop-letter-spacing" placeholder="0"
          value="${styles['letter-spacing'] || ''}">
      </div>

      <div class="ed-section-title">颜色</div>

      <div class="ed-field-row">
        <div class="ed-field">
          <label>color</label>
          <input type="color" id="prop-color" value="${cssColorToHex(styles['color'] || computed.color)}">
        </div>
        <div class="ed-field">
          <label>background-color</label>
          <input type="color" id="prop-bg" value="${cssColorToHex(styles['background-color'] || computed.backgroundColor)}">
        </div>
      </div>

      <div class="ed-section-title">间距 / 位置</div>

      <div class="ed-field-row">
        <div class="ed-field">
          <label>margin-top (px)</label>
          <input type="number" id="prop-margin-top" step="1"
            value="${parsePx(styles['margin-top'] || computed.marginTop)}">
        </div>
        <div class="ed-field">
          <label>margin-bottom (px)</label>
          <input type="number" id="prop-margin-bottom" step="1"
            value="${parsePx(styles['margin-bottom'] || computed.marginBottom)}">
        </div>
      </div>

      <div class="ed-field-row">
        <div class="ed-field">
          <label>padding (px)</label>
          <input type="text" id="prop-padding" placeholder="8px 12px"
            value="${styles['padding'] || ''}">
        </div>
        <div class="ed-field">
          <label>border-radius (px)</label>
          <input type="text" id="prop-border-radius" placeholder="8px"
            value="${styles['border-radius'] || ''}">
        </div>
      </div>

      ${isPage ? `
      <div class="ed-field">
        <label>页面 padding（覆盖 .page 默认内边距）</label>
        <input type="text" id="prop-page-padding" placeholder="96px 72px"
          value="${el.style.padding || ''}">
      </div>` : ''}

      <div class="ed-btn-row">
        <button type="button" id="btn-clear-style">清除 inline style</button>
        <button type="button" id="btn-deselect">取消选中</button>
      </div>
    `;

    if (isTextBlock) {
      document.getElementById('prop-text').addEventListener('input', (e) => {
        if (hasInnerTags) el.innerHTML = e.target.value;
        else el.textContent = e.target.value;
        markDirty();
        updateOverlay();
      });
    }

    const bind = (id, key, fmt) => {
      const node = document.getElementById(id);
      if (!node) return;
      node.addEventListener('input', () => {
        let val = node.value;
        if (fmt === 'px' && val !== '') val = `${val}px`;
        applyStyleKey(el, key, val);
      });
      node.addEventListener('change', () => {
        let val = node.value;
        if (fmt === 'px' && val !== '') val = `${val}px`;
        applyStyleKey(el, key, val);
      });
    };

    bind('prop-font-size', 'font-size', 'px');
    bind('prop-line-height', 'line-height');
    bind('prop-font-weight', 'font-weight');
    bind('prop-text-align', 'text-align');
    bind('prop-letter-spacing', 'letter-spacing');
    bind('prop-color', 'color');
    bind('prop-bg', 'background-color');
    bind('prop-margin-top', 'margin-top', 'px');
    bind('prop-margin-bottom', 'margin-bottom', 'px');
    bind('prop-padding', 'padding');
    bind('prop-border-radius', 'border-radius');

    const pagePad = document.getElementById('prop-page-padding');
    if (pagePad) {
      pagePad.addEventListener('input', () => applyStyleKey(el, 'padding', pagePad.value));
    }

    document.getElementById('btn-clear-style').onclick = () => {
      el.removeAttribute('style');
      markDirty();
      selectElement(el);
    };

    document.getElementById('btn-deselect').onclick = deselect;
  }

  function refreshPanelValues() {
    if (selected) buildPanel(selected);
  }

  function updateOverlay() {
    if (!selected) {
      overlay.classList.remove('visible');
      return;
    }

    const rect = selected.getBoundingClientRect();
    const wrapRect = canvasWrap.getBoundingClientRect();
    const scrollL = canvasWrap.scrollLeft;
    const scrollT = canvasWrap.scrollTop;

    overlay.classList.add('visible');
    overlay.style.left = `${rect.left - wrapRect.left + scrollL}px`;
    overlay.style.top = `${rect.top - wrapRect.top + scrollT}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;

    selBox.style.width = '100%';
    selBox.style.height = '100%';
    selLabel.textContent = getEditableLabel(selected);
  }

  function deselect() {
    if (selected) selected.classList.remove('ed-selected');
    selected = null;
    overlay.classList.remove('visible');
    panelBody.innerHTML = `<p class="ed-panel-empty">点击页面 (.page) 或内容块 (.block) 进行编辑。<br><br>
      拖动句柄可调整间距与字号；右侧面板可改颜色、对齐等。修改会写入元素的 inline style，保存时写回源 HTML。</p>`;
  }

  function selectElement(el) {
    if (selected) selected.classList.remove('ed-selected');
    selected = el;
    selected.classList.add('ed-selected');
    buildPanel(el);
    updateOverlay();
  }

  function findEditable(target) {
    let node = target;
    while (node && node !== docEl) {
      if (node.classList?.contains('block') || node.classList?.contains('page')) return node;
      node = node.parentElement;
    }
    return null;
  }

  function bindCanvasEvents() {
    docEl.querySelectorAll('.page, .block').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        if (el !== selected) el.classList.add('ed-hover');
      });
      el.addEventListener('mouseleave', () => el.classList.remove('ed-hover'));
    });

    docEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = findEditable(e.target);
      if (el) selectElement(el);
      else deselect();
    });
  }

  function startDrag(handle, e) {
    if (!selected) return;
    e.preventDefault();
    e.stopPropagation();

    const cs = getComputedStyle(selected);
    dragState = {
      handle,
      startY: e.clientY,
      startX: e.clientX,
      marginTop: parsePx(selected.style.marginTop || cs.marginTop),
      marginBottom: parsePx(selected.style.marginBottom || cs.marginBottom),
      fontSize: parsePx(selected.style.fontSize || cs.fontSize),
      padding: parsePx(selected.style.paddingTop || cs.paddingTop),
    };

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
  }

  function onDrag(e) {
    if (!dragState || !selected) return;
    const dy = e.clientY - dragState.startY;
    const dx = e.clientX - dragState.startX;

    const skip = true;
    switch (dragState.handle) {
      case 'margin-top':
        applyStyleKey(selected, 'margin-top', `${Math.max(0, Math.round(dragState.marginTop + dy))}px`, skip);
        break;
      case 'margin-bottom':
        applyStyleKey(selected, 'margin-bottom', `${Math.max(0, Math.round(dragState.marginBottom + dy))}px`, skip);
        break;
      case 'font-size': {
        const delta = Math.round((dy + dx) * 0.4);
        applyStyleKey(selected, 'font-size', `${Math.max(8, Math.round(dragState.fontSize + delta))}px`, skip);
        break;
      }
      case 'padding': {
        const p = Math.max(0, Math.round(dragState.padding - dy * 0.5));
        applyStyleKey(selected, 'padding', `${p}px`, skip);
        break;
      }
      default:
        break;
    }
  }

  function endDrag() {
    dragState = null;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', endDrag);
    if (selected) refreshPanelValues();
  }

  overlay.querySelectorAll('.ed-handle').forEach((h) => {
    h.addEventListener('mousedown', (e) => startDrag(h.dataset.handle, e));
  });

  canvasWrap.addEventListener('scroll', updateOverlay);
  window.addEventListener('resize', updateOverlay);

  function extractTemplateStyles(doc) {
    return [...doc.querySelectorAll('style')]
      .map((s) => s.textContent)
      .join('\n')
      .replace(/body\s*\{[^}]*\}/g, '/* body styles omitted in editor */');
  }

  function renderFromDoc(doc) {
    const docNode = doc.getElementById('doc');
    if (!docNode) {
      alert('未找到 #doc，请确认是 TextToPic 模板 HTML');
      return false;
    }

    tplStyles.textContent = extractTemplateStyles(doc);
    docEl.innerHTML = docNode.innerHTML;
    docEl.hidden = false;
    emptyState.hidden = true;

    bindCanvasEvents();
    deselect();
    return true;
  }

  async function loadHtmlText(text, name, handle) {
    sourceDoc = new DOMParser().parseFromString(text, 'text/html');
    if (!renderFromDoc(sourceDoc)) return;

    fileName = name || 'document.html';
    dirty = false;

    if (handle) {
      fileHandle = (await verifyHandleWrite(handle)) || handle;
    } else {
      fileHandle = null;
    }

    updateSaveButtons();
    refreshFileStatus();
  }

  function isHtmlFile(file) {
    const name = (file.name || '').toLowerCase();
    return name.endsWith('.html') || name.endsWith('.htm') || file.type === 'text/html';
  }

  async function loadFromFile(file, handle) {
    if (!file || !isHtmlFile(file)) {
      alert('请拖入 .html 文件');
      return;
    }
    if (dirty && !confirm('有未保存修改，确定加载新文件？')) return;
    await loadHtmlText(await file.text(), file.name, handle || null);
  }

  function bindDragDrop(target) {
    let depth = 0;

    target.addEventListener('dragenter', (e) => {
      e.preventDefault();
      depth += 1;
      target.classList.add('ed-drag-over');
    });

    target.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    target.addEventListener('dragleave', (e) => {
      e.preventDefault();
      depth -= 1;
      if (depth <= 0) {
        depth = 0;
        target.classList.remove('ed-drag-over');
      }
    });

    target.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      target.classList.remove('ed-drag-over');
      document.body.classList.remove('ed-drag-over');

      const handle = await getHandleFromDataTransfer(e.dataTransfer);
      const file = handle
        ? await handle.getFile()
        : [...e.dataTransfer.files].find(isHtmlFile);

      if (!file || !isHtmlFile(file)) {
        alert('请拖入 .html 文件');
        return;
      }
      await loadFromFile(file, handle);
    });
  }

  function stripEditorClasses(root) {
    root.querySelectorAll('.ed-hover, .ed-selected').forEach((el) => {
      el.classList.remove('ed-hover', 'ed-selected');
    });
  }

  function syncToSourceDoc() {
    stripEditorClasses(docEl);
    const liveDoc = sourceDoc.getElementById('doc');
    if (!liveDoc) return;
    liveDoc.innerHTML = docEl.innerHTML;
  }

  function serializeHtml() {
    syncToSourceDoc();
    const dt = sourceDoc.doctype;
    const doctypeStr = dt
      ? `<!DOCTYPE ${dt.name}${dt.publicId ? ` PUBLIC "${dt.publicId}"` : ''}${dt.systemId ? ` "${dt.systemId}"` : ''}>`
      : '<!DOCTYPE html>';
    return doctypeStr + '\n' + sourceDoc.documentElement.outerHTML;
  }

  async function saveToFile() {
    if (!sourceDoc) return;

    try {
      const handle = await ensureWriteHandle();
      const html = serializeHtml();
      const writable = await handle.createWritable();
      await writable.write(html);
      await writable.close();
      markClean();
      setStatus(`${fileName} · 已写回源文件`, false);
    } catch (err) {
      if (err.name === 'AbortError') return;
      alert('保存失败：' + err.message);
    }
  }

  function downloadHtml(html) {
    const blob = new Blob([html || serializeHtml()], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName || 'template.html';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function openWithPicker() {
    if (!supportsFileSystemAccess()) {
      fileInput.click();
      return;
    }

    try {
      const [handle] = await window.showOpenFilePicker({
        mode: 'readwrite',
        types: PICKER_TYPES,
        multiple: false,
      });
      const granted = await verifyHandleWrite(handle);
      if (!granted) {
        alert('需要授予文件写入权限才能写回源文件');
        return;
      }
      const file = await handle.getFile();
      await loadFromFile(file, handle);
    } catch (err) {
      if (err.name !== 'AbortError') alert('打开失败：' + err.message);
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    await loadFromFile(file, null);
  });

  bindDragDrop(canvasWrap);

  document.body.addEventListener('dragenter', (e) => {
    if ([...e.dataTransfer.types].includes('Files')) {
      e.preventDefault();
      document.body.classList.add('ed-drag-over');
    }
  });
  document.body.addEventListener('dragover', (e) => {
    if ([...e.dataTransfer.types].includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  });
  document.body.addEventListener('dragleave', (e) => {
    if (e.target === document.body || e.relatedTarget === null) {
      document.body.classList.remove('ed-drag-over');
    }
  });
  document.body.addEventListener('drop', async (e) => {
    if (e.target.closest('#canvas-wrap')) return;
    e.preventDefault();
    document.body.classList.remove('ed-drag-over');
    const handle = await getHandleFromDataTransfer(e.dataTransfer);
    const file = handle
      ? await handle.getFile()
      : [...e.dataTransfer.files].find(isHtmlFile);
    if (!file) return;
    await loadFromFile(file, handle);
  });

  document.getElementById('btn-open').addEventListener('click', openWithPicker);
  document.getElementById('btn-save').addEventListener('click', saveToFile);
  document.getElementById('btn-download').addEventListener('click', () => downloadHtml());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') deselect();
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (sourceDoc) saveToFile();
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();
