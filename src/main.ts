import { createApp } from 'vue'
import { createPinia } from 'pinia'

import { initAi } from '@/ai'
import { useArticlesStore } from '@/stores/articles'
import App from './App.vue'
import router from './router'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  initAi()

  await useArticlesStore().init()

  app.use(router)
  app.mount('#app')
}

void bootstrap()
