<script setup lang="ts">
import { computed, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { VisualHtmlEditor, type VisualHtmlEditorExpose } from '@/visual-html-editor'
import demoTemplateHtml from '@/visual-html-editor/demo/demoTemplate.html?raw'
import { useArticlesStore } from '@/stores/articles'
import { getActiveHtmlVersion } from '@/types/document'
import { downloadHtmlFile } from '@/utils/normalize-html'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const store = useArticlesStore()
const { showToast } = useToast()

const articleId = computed(() => route.params.id as string)
const article = computed(() => store.getArticleById(articleId.value))
const activeVersion = computed(() => getActiveHtmlVersion(article.value))

const editorRef = ref<VisualHtmlEditorExpose | null>(null)
const dirty = ref(false)

const initialHtml = computed(() => {
  const html = activeVersion.value?.html?.trim()
  return html || demoTemplateHtml
})

const usingDemo = computed(() => !activeVersion.value?.html?.trim())

const editorMountKey = computed(
  () => `${articleId.value}:${activeVersion.value?.id ?? 'demo'}`,
)

function confirmLeaveIfDirty() {
  if (!dirty.value) return true
  return confirm('有未保存的修改，确定离开？')
}

function handleCancel() {
  if (!confirmLeaveIfDirty()) return
  router.push({ name: 'html-preview', params: { id: articleId.value } })
}

function handleSave(html: string) {
  if (!article.value) return

  if (activeVersion.value) {
    store.updateArticleHtmlVersion(articleId.value, activeVersion.value.id, html)
  } else {
    store.addArticleHtmlVersion(articleId.value, html, {
      label: '可视化编辑',
      summary: '从分页示例创建',
    })
  }

  editorRef.value?.resetBaselineAfterCommit(html)
  dirty.value = false
  showToast('success', '修改已保存')
}

function handleDownload(html: string) {
  const safeName = article.value?.title?.replace(/[\\/:*?"<>|]/g, '_') || 'article'
  downloadHtmlFile(html, `${safeName}.html`)
}

onBeforeRouteLeave((_to, _from, next) => {
  next(confirmLeaveIfDirty())
})
</script>

<template>
  <div class="visual-editor-route">
    <VisualHtmlEditor
      :key="editorMountKey"
      ref="editorRef"
      :initial-html="initialHtml"
      :title="article?.title ?? '可视化编辑'"
      save-label="保存修改"
      cancel-label="← 返回预览"
      :preview-scope-id="`article-${articleId}`"
      @save="handleSave"
      @cancel="handleCancel"
      @download="handleDownload"
      @dirty-change="dirty = $event"
    >
      <template v-if="usingDemo" #toolbar-extra>
        <span class="visual-editor-demo-hint">分页示例 · 保存后创建 HTML 版本</span>
      </template>
    </VisualHtmlEditor>
  </div>
</template>

<style scoped>
.visual-editor-route {
  --hh-top-nav-height: 48px;
  height: 100%;
  min-height: 0;
}

.visual-editor-demo-hint {
  margin-left: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 12px;
  white-space: nowrap;
}
</style>
