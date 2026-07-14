<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { VisualHtmlEditor, type VisualHtmlEditorExpose } from '@/visual-html-editor'
import { bindPreviewPageLayout, teardownPreviewPageLayout } from '@/utils/texttopic/preview-page-layout'
import { useArticlesStore } from '@/stores/articles'
import { getActiveHtmlVersion } from '@/types/document'
import { resolveAssetsInHtml, restoreAssetRefsInHtml } from '@/utils/article-asset-html'
import { downloadHtmlFile } from '@/utils/normalize-html'
import { useToast } from '@/composables/useToast'
import {
  buildArticleVisualEditorPersistKey,
  visualEditorDraftPersistence,
} from '@/storage/visual-editor-drafts'

const route = useRoute()
const router = useRouter()
const store = useArticlesStore()
const { showToast } = useToast()

const articleId = computed(() => route.params.id as string)
const article = computed(() => store.getArticleById(articleId.value))
const queryVersionId = computed(() => {
  const raw = route.query.versionId
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
})

const activeVersion = computed(() => getActiveHtmlVersion(article.value))
const targetVersion = computed(() => {
  const versions = article.value?.htmlVersions
  if (!versions?.length) return null
  if (queryVersionId.value) {
    const matched = versions.find((v) => v.id === queryVersionId.value)
    if (matched) return matched
  }
  return activeVersion.value
})

const editorRef = ref<VisualHtmlEditorExpose | null>(null)
const dirty = ref(false)
const readyHtml = ref('')
const loadingHtml = ref(false)
const loadError = ref('')

const editorTitle = computed(() => {
  const title = article.value?.title?.trim() || '可视化编辑'
  const label = targetVersion.value?.label
  return label ? `${title} · ${label}` : title
})

const persistKey = computed(() => {
  if (!articleId.value || !targetVersion.value) return ''
  return buildArticleVisualEditorPersistKey(articleId.value, targetVersion.value.id)
})

const persistLabel = computed(() => editorTitle.value)

const editorMountKey = computed(
  () => `${articleId.value}:${targetVersion.value?.id ?? 'none'}:${readyHtml.value ? 'ready' : 'wait'}`,
)

const showEditor = computed(
  () => !!article.value && !!targetVersion.value && !!readyHtml.value && !loadingHtml.value,
)

function handleEditorFrameLoad(doc: Document) {
  bindPreviewPageLayout(doc)
}

function confirmLeaveIfDirty() {
  if (!dirty.value) return true
  return confirm('有未保存的修改，确定离开？')
}

function handleCancel() {
  if (!confirmLeaveIfDirty()) return
  router.push({ name: 'html-preview', params: { id: articleId.value } })
}

function handleSave(html: string) {
  if (!article.value || !targetVersion.value) return

  const persisted = restoreAssetRefsInHtml(html)
  store.updateArticleHtmlVersion(articleId.value, targetVersion.value.id, persisted, {
    summary: targetVersion.value.summary,
  })

  editorRef.value?.resetBaselineAfterCommit(html)
  editorRef.value?.clearPersistedDraft?.()
  dirty.value = false
  showToast('success', '修改已保存')
}

function handleDownload(html: string) {
  const persisted = restoreAssetRefsInHtml(html)
  const safeName = article.value?.title?.replace(/[\\/:*?"<>|]/g, '_') || 'article'
  downloadHtmlFile(persisted, `${safeName}.html`)
}

async function prepareEditorHtml() {
  loadError.value = ''
  readyHtml.value = ''

  if (!article.value) {
    loadError.value = '文稿不存在'
    return
  }

  store.selectArticle(articleId.value)

  const version = targetVersion.value
  if (!version) {
    loadError.value = '当前文稿还没有 HTML 版本，请先生成或上传 HTML'
    return
  }

  if (article.value.activeHtmlVersionId !== version.id) {
    store.selectHtmlVersion(articleId.value, version.id)
  }

  loadingHtml.value = true
  try {
    readyHtml.value = await resolveAssetsInHtml(version.html)
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    loadingHtml.value = false
  }
}

watch(
  () => [articleId.value, queryVersionId.value, targetVersion.value?.id] as const,
  () => {
    void prepareEditorHtml()
  },
  { immediate: true },
)

watch(
  () => article.value,
  (value) => {
    if (!value) {
      showToast('error', '文稿不存在')
      router.replace({ name: 'documents' })
    }
  },
  { immediate: true },
)

onBeforeRouteLeave((_to, _from, next) => {
  teardownPreviewPageLayout()
  next(confirmLeaveIfDirty())
})

onBeforeUnmount(() => {
  teardownPreviewPageLayout()
})
</script>

<template>
  <div class="visual-editor-route">
    <div v-if="loadingHtml" class="visual-editor-status">正在加载 HTML…</div>
    <div v-else-if="loadError" class="visual-editor-status visual-editor-status--error">
      <p>{{ loadError }}</p>
      <button type="button" class="visual-editor-back" @click="router.push({ name: 'html-preview', params: { id: articleId } })">
        ← 返回预览
      </button>
    </div>
    <VisualHtmlEditor
      v-else-if="showEditor"
      :key="editorMountKey"
      ref="editorRef"
      :initial-html="readyHtml"
      :title="editorTitle"
      save-label="保存修改"
      cancel-label="← 返回预览"
      download-label="下载当前版本"
      :enable-version-bar="true"
      :preview-scope-id="`article-${articleId}`"
      :persist-key="persistKey"
      :persist-label="persistLabel"
      :persistence="visualEditorDraftPersistence"
      @save="handleSave"
      @cancel="handleCancel"
      @download="handleDownload"
      @dirty-change="dirty = $event"
      @frame-load="handleEditorFrameLoad"
    />
  </div>
</template>

<style scoped>
.visual-editor-route {
  --hh-top-nav-height: 48px;
  height: 100%;
  min-height: 0;
}

.visual-editor-status {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 24px;
  color: #64748b;
  font-size: 14px;
}

.visual-editor-status--error {
  color: #b91c1c;
}

.visual-editor-back {
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  color: #0f172a;
  font-size: 13px;
}

.visual-editor-back:hover {
  background: #f8fafc;
}
</style>
