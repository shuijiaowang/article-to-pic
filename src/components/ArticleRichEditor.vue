<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import { ArticleImage } from '@/editor/extensions/article-image'
import { revokeAllAssetBlobUrls, saveArticleAsset, getAssetBlobUrl } from '@/storage/article-assets'
import { pickUniqueAssetPath, syncAssetToFolder } from '@/work-package'
import { resolveAssetsInHtml } from '@/utils/article-asset-html'
import { normalizeArticleContent, serializeArticleContent } from '@/utils/article-content'
import { readImageDimensions } from '@/utils/asset-url'

const props = defineProps<{
  modelValue: string
  articleId?: string
  placeholder?: string
  /** 紧凑高度，用于封面/备注等次要区域 */
  compact?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  input: []
}>()

const imgInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadError = ref('')
let loadSeq = 0

const editor = useEditor({
  content: '',
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Highlight,
    ArticleImage.configure({
      inline: true,
      allowBase64: false,
    }),
  ],
  editorProps: {
    attributes: {
      class: 'article-rich-editor__content',
    },
  },
  onUpdate: ({ editor: ed }) => {
    emit('update:modelValue', serializeArticleContent(ed.getHTML()))
    emit('input')
  },
})

async function loadEditorContent(rawContent: string) {
  const seq = ++loadSeq
  const normalized = normalizeArticleContent(rawContent)
  // 先把 asset:// 换成 blob:，再交给 TipTap（否则浏览器无法加载）
  const resolved = await resolveAssetsInHtml(normalized)

  if (seq !== loadSeq) return

  const ed = editor.value
  if (!ed) return

  const editorHtml = ed.getHTML()
  if (editorHtml === resolved) return

  const sameRefs =
    serializeArticleContent(editorHtml) === serializeArticleContent(normalized)
  const stillUnresolved = editorHtml.includes('asset://')
  if (sameRefs && !stillUnresolved) return

  ed.commands.setContent(resolved || '<p></p>', { emitUpdate: false })
}

watch(
  () => [props.modelValue, props.articleId] as const,
  ([value]) => {
    void loadEditorContent(value)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  editor.value?.destroy()
  revokeAllAssetBlobUrls()
})

function run(action: () => boolean) {
  action()
  editor.value?.commands.focus()
}

function openImagePicker() {
  if (!props.articleId) {
    uploadError.value = '请先保存或选择一篇文稿后再上传图片'
    return
  }
  uploadError.value = ''
  imgInputRef.value?.click()
}

async function onImageSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !props.articleId) return

  if (!file.type.startsWith('image/')) {
    uploadError.value = '请选择图片文件'
    return
  }

  uploading.value = true
  uploadError.value = ''

  try {
    const { width, height } = await readImageDimensions(file)
    const assetId = crypto.randomUUID()
    const path = await pickUniqueAssetPath(props.articleId, file.name)

    const record = await saveArticleAsset({
      id: assetId,
      articleId: props.articleId,
      blob: file,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      width,
      height,
      path,
    })

    void syncAssetToFolder(props.articleId, {
      id: record.id,
      path: record.path!,
      blob: record.blob,
      mime: record.mime,
      width: record.width,
      height: record.height,
      size: record.size,
    })

    const blobUrl = await getAssetBlobUrl(assetId)
    const ed = editor.value
    if (!ed || !blobUrl) return

    ed.chain()
      .focus()
      .insertContent({
        type: 'articleImage',
        attrs: {
          src: blobUrl,
          alt: file.name.replace(/\.[^.]+$/, ''),
          dataAssetId: assetId,
          dataWidth: String(width),
          dataHeight: String(height),
        },
      })
      .run()
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : '图片上传失败'
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="article-rich-editor" :class="{ 'article-rich-editor--compact': compact }">
    <div v-if="editor" class="article-rich-editor__toolbar">
      <div class="toolbar-group">
        <button
          type="button"
          class="toolbar-btn"
          :class="{ active: editor.isActive('heading', { level: 1 }) }"
          title="标题 1"
          @click="run(() => editor!.chain().focus().toggleHeading({ level: 1 }).run())"
        >
          H1
        </button>
        <button
          type="button"
          class="toolbar-btn"
          :class="{ active: editor.isActive('heading', { level: 2 }) }"
          title="标题 2"
          @click="run(() => editor!.chain().focus().toggleHeading({ level: 2 }).run())"
        >
          H2
        </button>
        <button
          type="button"
          class="toolbar-btn"
          :class="{ active: editor.isActive('heading', { level: 3 }) }"
          title="标题 3"
          @click="run(() => editor!.chain().focus().toggleHeading({ level: 3 }).run())"
        >
          H3
        </button>
        <button
          type="button"
          class="toolbar-btn"
          :class="{ active: editor.isActive('paragraph') }"
          title="正文"
          @click="run(() => editor!.chain().focus().setParagraph().run())"
        >
          正文
        </button>
      </div>

      <span class="toolbar-divider" />

      <div class="toolbar-group">
        <button
          type="button"
          class="toolbar-btn"
          :class="{ active: editor.isActive('bold') }"
          title="加粗"
          @click="run(() => editor!.chain().focus().toggleBold().run())"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          class="toolbar-btn"
          :class="{ active: editor.isActive('italic') }"
          title="斜体"
          @click="run(() => editor!.chain().focus().toggleItalic().run())"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          class="toolbar-btn toolbar-btn--highlight"
          :class="{ active: editor.isActive('highlight') }"
          title="高亮"
          @click="run(() => editor!.chain().focus().toggleHighlight().run())"
        >
          高亮
        </button>
      </div>

      <span class="toolbar-divider" />

      <div class="toolbar-group">
        <button
          type="button"
          class="toolbar-btn"
          :class="{ active: editor.isActive('bulletList') }"
          title="无序列表"
          @click="run(() => editor!.chain().focus().toggleBulletList().run())"
        >
          • 列表
        </button>
        <button
          type="button"
          class="toolbar-btn"
          :class="{ active: editor.isActive('orderedList') }"
          title="有序列表"
          @click="run(() => editor!.chain().focus().toggleOrderedList().run())"
        >
          1. 列表
        </button>
        <button
          type="button"
          class="toolbar-btn"
          :class="{ active: editor.isActive('blockquote') }"
          title="引用"
          @click="run(() => editor!.chain().focus().toggleBlockquote().run())"
        >
          引用
        </button>
        <button
          type="button"
          class="toolbar-btn"
          :disabled="uploading || !articleId"
          title="插入图片（二进制存 IndexedDB，正文只存引用）"
          @click="openImagePicker"
        >
          {{ uploading ? '上传中…' : '图片' }}
        </button>
      </div>
    </div>

    <p v-if="uploadError" class="article-rich-editor__error">{{ uploadError }}</p>

    <div class="article-rich-editor__body">
      <EditorContent :editor="editor" />
      <p v-if="editor?.isEmpty" class="article-rich-editor__placeholder">
        {{ placeholder ?? '在此输入正文…' }}
      </p>
    </div>

    <input
      ref="imgInputRef"
      type="file"
      accept="image/*"
      hidden
      @change="onImageSelected"
    />
  </div>
</template>

<style scoped>
.article-rich-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid #e5e5ea;
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}

.article-rich-editor--compact {
  flex: none;
  height: 220px;
}

.article-rich-editor:focus-within {
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.12);
}

.article-rich-editor__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border-bottom: 1px solid #e5e5ea;
  background: #fafafa;
}

.toolbar-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.toolbar-divider {
  width: 1px;
  height: 22px;
  background: #e5e5ea;
  margin: 0 4px;
}

.toolbar-btn {
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #444;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 1.4;
}

.toolbar-btn:hover:not(:disabled) {
  background: #eee;
}

.toolbar-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.toolbar-btn.active {
  background: #ede9fe;
  border-color: #c4b5fd;
  color: #5b21b6;
}

.toolbar-btn--highlight.active {
  background: #fef08a;
  border-color: #facc15;
  color: #713f12;
}

.article-rich-editor__error {
  margin: 0;
  padding: 6px 12px;
  font-size: 12px;
  color: #dc2626;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
}

.article-rich-editor__body {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.article-rich-editor__placeholder {
  position: absolute;
  top: 16px;
  left: 16px;
  margin: 0;
  color: #aaa;
  font-size: 15px;
  line-height: 1.7;
  pointer-events: none;
  user-select: none;
}

.article-rich-editor__body :deep(.tiptap) {
  min-height: 100%;
  padding: 16px;
  outline: none;
  font-size: 15px;
  line-height: 1.7;
  color: #1a1a1a;
}

.article-rich-editor__body :deep(.tiptap > * + *) {
  margin-top: 0.75em;
}

.article-rich-editor__body :deep(.tiptap h1) {
  font-size: 1.75em;
  font-weight: 700;
  line-height: 1.3;
}

.article-rich-editor__body :deep(.tiptap h2) {
  font-size: 1.4em;
  font-weight: 600;
  line-height: 1.35;
}

.article-rich-editor__body :deep(.tiptap h3) {
  font-size: 1.15em;
  font-weight: 600;
  line-height: 1.4;
}

.article-rich-editor__body :deep(.tiptap ul),
.article-rich-editor__body :deep(.tiptap ol) {
  padding-left: 1.5em;
}

.article-rich-editor__body :deep(.tiptap blockquote) {
  margin: 0;
  padding: 0.5em 0 0.5em 1em;
  border-left: 3px solid #c4b5fd;
  color: #555;
}

.article-rich-editor__body :deep(.tiptap mark) {
  background: #fef08a;
  border-radius: 2px;
  padding: 0 2px;
}

.article-rich-editor__body :deep(.tiptap img) {
  display: block;
  max-width: min(100%, 320px);
  max-height: 240px;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 8px;
  margin: 0.5em 0;
  background: #f3f4f6;
}

.article-rich-editor--compact :deep(.tiptap img) {
  max-width: min(100%, 200px);
  max-height: 140px;
}
</style>
