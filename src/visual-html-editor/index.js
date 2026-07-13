export { default as VisualHtmlEditor } from './components/VisualHtmlEditor.vue'
export { default as HtmlImportPanel } from './components/HtmlImportPanel.vue'
export { default as HtmlImportDialog } from './components/HtmlImportDialog.vue'
export { useVisualHtmlEditor } from './composables/useVisualHtmlEditor.js'
export { useVisualHtmlPersistence } from './composables/useVisualHtmlPersistence.js'
export { useVisualHtmlVersionManager, createVersionEntry } from './composables/useVisualHtmlVersionManager.js'
export {
  parseHtmlForEdit,
  captureLiveDocumentHtml,
  freezeLiveDocumentVisibility,
  cleanEditorArtifacts,
  EDIT_GUIDE_STYLE_ID,
  OVERLAY_ROOT_ID,
  OVERLAY_STYLE_ID,
  serializeDocumentHtml,
} from './utils/htmlDocument.js'
export { createPreviewBlobUrl, buildPreviewHtml, revokePreviewBlobUrl } from './utils/previewFrame.js'
export { validateFullHTMLStructure } from './utils/htmlValidation.js'
export { formatBytes } from './utils/formatBytes.js'
export { buildEditChangeLog, formatEditChangeLogForAi, getDomPath } from './utils/editChangeLog.js'
export { STYLE_KEYS, HISTORY_LIMIT } from './constants/styleKeys.js'
