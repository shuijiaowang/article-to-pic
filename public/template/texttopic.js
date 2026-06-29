/**
 * TextToPic 工具栏逻辑（与 template.html 配套，勿改 HTML 内 #doc 以外的结构）
 *
 * 职责：
 * 1. 布局报告 — 测量每页/每块坐标与图片尺寸，生成 JSON 供 AI 第二轮调整
 * 2. 图片占位 — 点击 .block.img 上传本地图，嵌入 base64
 * 3. PNG 导出 — 用 html2canvas 逐页截图为 1080×1440
 */

(function () {
  'use strict';

  const PAGE_W = 1080;
  const PAGE_H = 1440;
  const BLOCK_TYPES = ['cover-title', 'cover-sub', 'cover-tag', 'h1', 'h2', 'text', 'li', 'quote', 'img'];

  const statusEl = document.getElementById('status');
  const imgInput = document.getElementById('img-input');
  const reportPanel = document.getElementById('report-panel');
  const reportOutput = document.getElementById('report-output');
  let pendingImgBlock = null;
  let lastReport = null;

  function setStatus(msg, isWarn) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('warn', !!isWarn);
  }

  function getPreviewScale() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--preview-scale').trim();
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0.38;
  }

  /** 缩放预览后修正 page-wrap 占位，避免布局空白（页高可变） */
  function updatePreviewLayout() {
    const scale = getPreviewScale();
    document.querySelectorAll('.page-wrap').forEach((wrap) => {
      const h = wrap.offsetHeight;
      wrap.style.marginBottom = `${h * (scale - 1)}px`;
      wrap.style.marginRight = `${PAGE_W * (scale - 1)}px`;
    });
  }

  function getPages() {
    return [...document.querySelectorAll('#doc .page')];
  }

  function getBlockType(block) {
    return BLOCK_TYPES.find((t) => block.classList.contains(t)) || 'unknown';
  }

  function textPreview(block) {
    const text = (block.getAttribute('data-placeholder') || block.textContent || '').trim();
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  }

  /** 块相对 .page 内容区顶部的 top（px，不受预览缩放影响） */
  function blockTopInPage(block, page) {
    let top = 0;
    let node = block;
    while (node && node !== page) {
      top += node.offsetTop;
      node = node.offsetParent;
      if (node && node !== page && !page.contains(node)) break;
    }
    return Math.round(top);
  }

  function pickComputedStyle(block) {
    const cs = getComputedStyle(block);
    return {
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      marginTop: cs.marginTop,
      marginBottom: cs.marginBottom,
      padding: cs.padding,
    };
  }

  function measureImageBlock(block) {
    const img = block.querySelector('img');
    if (!img) {
      return {
        hasImage: false,
        placeholder: block.getAttribute('data-placeholder') || '',
        renderedWidth: Math.round(block.offsetWidth),
        renderedHeight: Math.round(block.offsetHeight),
      };
    }
    return {
      hasImage: true,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      renderedWidth: Math.round(img.offsetWidth),
      renderedHeight: Math.round(img.offsetHeight),
      aspectRatio: img.naturalHeight
        ? +(img.naturalWidth / img.naturalHeight).toFixed(3)
        : null,
    };
  }

  function measureBlock(block, page) {
    const top = blockTopInPage(block, page);
    const height = Math.round(block.offsetHeight);
    const bottom = top + height;
    const type = getBlockType(block);
    const data = {
      dataId: block.getAttribute('data-id') || null,
      type,
      top,
      bottom,
      height,
      overflowsCanvas: bottom > PAGE_H,
      clipPx: bottom > PAGE_H ? bottom - PAGE_H : 0,
      inlineStyle: block.getAttribute('style') || '',
      computed: pickComputedStyle(block),
    };
    if (type !== 'img') {
      data.textPreview = textPreview(block);
    } else {
      data.image = measureImageBlock(block);
    }
    return data;
  }

  function measurePage(page, index) {
    const contentHeight = page.scrollHeight;
    const overflowPx = Math.max(0, contentHeight - PAGE_H);
    const blocks = [...page.querySelectorAll(':scope > .block')].map((b) => measureBlock(b, page));
    const overflowBlocks = blocks.filter((b) => b.overflowsCanvas).map((b) => b.dataId).filter(Boolean);

    return {
      page: page.getAttribute('data-page') || String(index + 1),
      canvas: { width: PAGE_W, height: PAGE_H },
      contentHeight,
      overflow: overflowPx > 2,
      overflowPx: overflowPx > 2 ? overflowPx : 0,
      blockCount: blocks.length,
      blocks,
      overflowBlocks,
    };
  }

  /** 标记溢出页/块（不隐藏，仅视觉提示） */
  function markOverflowVisual(pages) {
    pages.forEach((page) => {
      const overflow = page.scrollHeight > PAGE_H + 2;
      page.classList.toggle('page--overflow', overflow);
      page.querySelectorAll(':scope > .block').forEach((block) => {
        const top = blockTopInPage(block, page);
        const bottom = top + block.offsetHeight;
        block.classList.toggle('block--overflow', bottom > PAGE_H);
      });
    });
    updatePreviewLayout();
  }

  function buildSummary(pages) {
    const overflowPages = pages.filter((p) => p.overflow);
    if (!overflowPages.length) {
      return `共 ${pages.length} 页，均未超出 ${PAGE_H}px 导出区域。`;
    }
    const details = overflowPages.map(
      (p) => `第 ${p.page} 页超出 ${p.overflowPx}px（块: ${p.overflowBlocks.join(', ') || '—'}）`
    );
    return `共 ${pages.length} 页，${overflowPages.length} 页溢出。${details.join('；')}。`;
  }

  function generateLayoutReport() {
    const pages = getPages().map(measurePage);
    markOverflowVisual(getPages());

    const report = {
      version: 1,
      tool: 'TextToPic',
      generatedAt: new Date().toISOString(),
      canvas: { width: PAGE_W, height: PAGE_H },
      summary: buildSummary(pages),
      pageCount: pages.length,
      overflowPageCount: pages.filter((p) => p.overflow).length,
      pages,
      aiHint:
        '根据 layoutReport 调整 #doc：优先把 overflowBlocks 拆到新 .page；' +
        '其次减字或改 margin/font-size（白名单）。只改对应 data-id，勿动 head/toolbar/script。',
    };
    return report;
  }

  function showLayoutReport() {
    lastReport = generateLayoutReport();
    const json = JSON.stringify(lastReport, null, 2);
    reportOutput.value = json;
    reportPanel.hidden = false;

    const n = lastReport.overflowPageCount;
    if (n === 0) {
      setStatus('布局报告已生成：无溢出，可复制发给 AI 核对');
    } else {
      setStatus(`布局报告已生成：${n} 页溢出，请复制 JSON 发给 AI 调整`, true);
    }
  }

  async function copyReport() {
    const text = reportOutput.value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus('报告已复制到剪贴板');
    } catch {
      reportOutput.select();
      document.execCommand('copy');
      setStatus('报告已复制到剪贴板');
    }
  }

  function ensureImgPlaceholders() {
    document.querySelectorAll('.block.img').forEach((block) => {
      if (block.querySelector('img')) return;
      if (block.querySelector('.placeholder-hint')) return;
      const hint = document.createElement('span');
      hint.className = 'placeholder-hint';
      hint.textContent = block.getAttribute('data-placeholder') || '点击上传图片';
      block.appendChild(hint);
    });
  }

  function bindImgBlocks() {
    document.querySelectorAll('.block.img').forEach((block) => {
      block.onclick = () => {
        pendingImgBlock = block;
        imgInput.click();
      };
    });
  }

  imgInput.addEventListener('change', () => {
    const file = imgInput.files?.[0];
    imgInput.value = '';
    if (!file || !pendingImgBlock) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingImgBlock.innerHTML = '';
      const img = document.createElement('img');
      img.src = reader.result;
      img.alt = pendingImgBlock.getAttribute('data-placeholder') || '';
      pendingImgBlock.appendChild(img);
      pendingImgBlock = null;
      setStatus('图片已嵌入 HTML（base64），记得保存文件');
      markOverflowVisual(getPages());
    };
    reader.readAsDataURL(file);
  });

  async function exportPage(page, index) {
    const wrap = page.closest('.page-wrap');
    if (wrap) wrap.classList.add('is-exporting');
    try {
      const canvas = await html2canvas(page, {
        width: PAGE_W,
        height: PAGE_H,
        scale: 1,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const link = document.createElement('a');
      const num = page.getAttribute('data-page') || index + 1;
      link.download = `page-${num}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      if (wrap) wrap.classList.remove('is-exporting');
    }
  }

  async function exportAll() {
    const pages = getPages();
    if (!pages.length) return;
    setStatus('导出中…');
    for (let i = 0; i < pages.length; i++) {
      await exportPage(pages[i], i);
    }
    setStatus(`已导出 ${pages.length} 页（每页 ${PAGE_W}×${PAGE_H}，超出部分不进入 PNG）`);
  }

  document.getElementById('btn-export-all').addEventListener('click', exportAll);
  document.getElementById('btn-layout-report').addEventListener('click', showLayoutReport);
  document.getElementById('btn-copy-report').addEventListener('click', copyReport);
  document.getElementById('btn-close-report').addEventListener('click', () => {
    reportPanel.hidden = true;
  });

  ensureImgPlaceholders();
  bindImgBlocks();
  markOverflowVisual(getPages());
})();
