import { createRouter, createWebHistory } from 'vue-router'
import { useArticlesStore } from '@/stores/articles'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/editor/article/:id',
      redirect: (to) => ({ name: 'visual-editor', params: { id: to.params.id } }),
    },
    {
      path: '/visual-editor',
      name: 'visual-editor-hub',
      redirect: () => {
        const store = useArticlesStore()
        const id = store.activeId ?? store.sortedArticles[0]?.id
        if (id) return { name: 'visual-editor', params: { id } }
        return { name: 'documents' }
      },
    },
    {
      path: '/visual-editor/:id',
      name: 'visual-editor',
      component: () => import('@/views/VisualEditorView.vue'),
    },
    {
      path: '/documents',
      name: 'documents',
      component: () => import('@/views/DocumentsView.vue'),
    },
    {
      path: '/preview/:id',
      name: 'html-preview',
      component: () => import('@/views/HtmlPreviewView.vue'),
    },
  ],
})

export default router
