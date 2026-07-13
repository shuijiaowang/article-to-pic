import { onBeforeUnmount, toValue, watch } from 'vue'

const DEFAULT_DEBOUNCE_MS = 500

function isPersistenceAdapter(value) {
  return Boolean(value && typeof value.load === 'function' && typeof value.save === 'function')
}

/**
 * Optional draft persistence for VisualHtmlEditor.
 * Storage is injected via adapter so the module stays host-project agnostic.
 */
export function useVisualHtmlPersistence(options = {}) {
  const {
    persistKey,
    persistLabel,
    persistence,
    enabled = true,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    flushState,
    exportState,
    onPersist,
  } = options

  let saveTimer = 0
  let unwatchers = []

  function canPersist() {
    if (!toValue(enabled)) return false
    const key = String(toValue(persistKey) || '').trim()
    const adapter = toValue(persistence)
    return Boolean(key && isPersistenceAdapter(adapter))
  }

  function buildMeta() {
    return {
      label: String(toValue(persistLabel) || '').trim(),
    }
  }

  function flushSave() {
    if (!canPersist()) return false
    try {
      flushState?.()
      const state = exportState?.()
      if (!state?.versions?.length) return false

      const key = String(toValue(persistKey)).trim()
      const adapter = toValue(persistence)
      adapter.save(key, state, buildMeta())
      onPersist?.({ key, state, meta: buildMeta() })
      return true
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[VisualHtmlEditor] persist failed', error)
      return false
    }
  }

  function scheduleSave() {
    if (!canPersist()) return
    if (saveTimer) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      saveTimer = 0
      flushSave()
    }, debounceMs)
  }

  function loadPersistedState() {
    if (!canPersist()) return null
    const key = String(toValue(persistKey)).trim()
    const adapter = toValue(persistence)
    const state = adapter.load(key)
    if (!state?.versions?.length) return null
    return state
  }

  function clearPersisted() {
    if (!canPersist()) return false
    if (saveTimer) {
      window.clearTimeout(saveTimer)
      saveTimer = 0
    }
    const key = String(toValue(persistKey)).trim()
    const adapter = toValue(persistence)
    adapter.remove?.(key)
    return true
  }

  function bindAutoSave(getWatchSources) {
    unwatchers.forEach((stop) => stop())
    unwatchers = []

    const sources = getWatchSources?.() || []
    sources.forEach((source) => {
      unwatchers.push(watch(source, () => {
        scheduleSave()
      }, { deep: true }))
    })
  }

  onBeforeUnmount(() => {
    if (saveTimer) {
      window.clearTimeout(saveTimer)
      saveTimer = 0
    }
    flushSave()
    unwatchers.forEach((stop) => stop())
    unwatchers = []
  })

  return {
    canPersist,
    loadPersistedState,
    scheduleSave,
    flushSave,
    clearPersisted,
    bindAutoSave,
  }
}
