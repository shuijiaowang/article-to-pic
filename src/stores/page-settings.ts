import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { PageHeightPreset } from '@/types/page-settings'
import {
  loadPageSizeConfig,
  savePageSizeConfig,
  getCanvasLabel,
  getExportDimensions,
  PAGE_SETTINGS_STORAGE_KEY,
} from '@/utils/page-size'

export const usePageSettingsStore = defineStore('page-settings', () => {
  const config = ref(loadPageSizeConfig())

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === PAGE_SETTINGS_STORAGE_KEY) reloadFromStorage()
    })
  }

  const canvasLabel = computed(() => getCanvasLabel(config.value))
  const exportDimensions = computed(() => getExportDimensions(config.value))

  function reloadFromStorage() {
    config.value = loadPageSizeConfig()
  }

  function setPageHeight(height: PageHeightPreset) {
    if (config.value.height === height) return
    config.value = { ...config.value, height }
    savePageSizeConfig({ height })
  }

  return {
    config,
    canvasLabel,
    exportDimensions,
    reloadFromStorage,
    setPageHeight,
  }
})
