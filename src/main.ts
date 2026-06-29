import { createApp } from 'vue'
import { createPinia } from 'pinia'

import { initAi } from '@/ai'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

initAi()

app.mount('#app')
