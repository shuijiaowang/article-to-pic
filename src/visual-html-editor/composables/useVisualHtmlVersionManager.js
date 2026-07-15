import { computed, ref } from 'vue'

function cloneSnapshot(snapshot) {
  if (!snapshot) return null
  return {
    t: snapshot.t,
    reason: snapshot.reason,
    bodyHtml: String(snapshot.bodyHtml ?? ''),
  }
}

function cloneSnapshotList(list) {
  return (Array.isArray(list) ? list : []).map(cloneSnapshot)
}

function normalizeMeta(meta = {}) {
  const label = typeof meta.label === 'string' ? meta.label.trim() : ''
  const summary = typeof meta.summary === 'string' ? meta.summary.trim() : ''
  const createdAt = Number(meta.createdAt)
  const id = typeof meta.id === 'string' ? meta.id.trim() : ''
  return {
    id: id || undefined,
    label: label || undefined,
    summary: summary || undefined,
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : undefined,
  }
}

function emptyHistory() {
  return {
    historyPast: [],
    historyCurrent: null,
    historyFuture: [],
    baselineBodyHtml: '',
  }
}

/** @param {string} [id] @param {string} html @param {Record<string, unknown>} [meta] */
export function createVersionEntry(id, html, meta = {}) {
  const normalized = normalizeMeta({ ...meta, id })
  return {
    id: normalized.id || crypto.randomUUID(),
    html: String(html ?? ''),
    createdAt: normalized.createdAt || Date.now(),
    label: normalized.label,
    summary: normalized.summary,
    ...emptyHistory(),
  }
}

export function useVisualHtmlVersionManager() {
  const versions = ref([])
  const activeVersionId = ref('')
  let pendingHistoryRestore = null

  const activeVersion = computed(() =>
    versions.value.find((item) => item.id === activeVersionId.value) || null,
  )

  const versionCount = computed(() => versions.value.length)

  function resetVersions(html, meta = {}) {
    const entry = createVersionEntry(undefined, html, {
      ...meta,
      label: normalizeMeta(meta).label || '版本 1',
    })
    versions.value = [entry]
    activeVersionId.value = entry.id
    pendingHistoryRestore = null
    return entry
  }

  function queueHistoryRestore(state) {
    pendingHistoryRestore = state
      ? {
          past: cloneSnapshotList(state.historyPast),
          current: cloneSnapshot(state.historyCurrent),
          future: cloneSnapshotList(state.historyFuture),
          baseline: String(state.baselineBodyHtml ?? ''),
        }
      : null
  }

  function consumePendingHistoryRestore() {
    const pending = pendingHistoryRestore
    pendingHistoryRestore = null
    return pending
  }

  function flushVersionState(version, snapshot) {
    if (!version || !snapshot) return
    version.html = String(snapshot.html ?? '')
    version.historyPast = cloneSnapshotList(snapshot.historyPast)
    version.historyCurrent = cloneSnapshot(snapshot.historyCurrent)
    version.historyFuture = cloneSnapshotList(snapshot.historyFuture)
    version.baselineBodyHtml = String(snapshot.baselineBodyHtml ?? '')
  }

  function createNextVersion(html, meta = {}) {
    const normalized = normalizeMeta(meta)
    const entry = createVersionEntry(normalized.id, html, {
      ...normalized,
      label: normalized.label || `版本 ${versions.value.length + 1}`,
    })
    versions.value = [...versions.value, entry]
    activeVersionId.value = entry.id
    queueHistoryRestore(null)
    return entry
  }

  function selectVersion(versionId) {
    const targetId = String(versionId || '').trim()
    if (!targetId) return null
    const target = versions.value.find((item) => item.id === targetId)
    if (!target) return null
    activeVersionId.value = targetId
    queueHistoryRestore({
      historyPast: target.historyPast,
      historyCurrent: target.historyCurrent,
      historyFuture: target.historyFuture,
      baselineBodyHtml: target.baselineBodyHtml,
    })
    return target
  }

  function getVersionHtml(versionId) {
    const target = versions.value.find((item) => item.id === String(versionId || ''))
    return target ? String(target.html ?? '') : ''
  }

  function updateActiveVersionHtml(html) {
    const version = activeVersion.value
    if (!version) return
    version.html = String(html ?? '')
  }

  function cloneVersionEntry(version) {
    if (!version) return null
    const normalized = normalizeMeta(version)
    const id = String(version.id || normalized.id || '').trim() || crypto.randomUUID()
    return {
      id,
      html: String(version.html ?? ''),
      createdAt: normalized.createdAt || Number(version.createdAt) || Date.now(),
      label: normalized.label,
      summary: normalized.summary,
      historyPast: cloneSnapshotList(version.historyPast),
      historyCurrent: cloneSnapshot(version.historyCurrent),
      historyFuture: cloneSnapshotList(version.historyFuture),
      baselineBodyHtml: String(version.baselineBodyHtml ?? ''),
    }
  }

  function exportVersionState() {
    for (const version of versions.value) {
      if (!String(version.id || '').trim()) {
        version.id = crypto.randomUUID()
      }
    }
    return {
      versions: versions.value.map(cloneVersionEntry),
      activeVersionId: activeVersionId.value,
    }
  }

  function importVersionState(state) {
    const list = Array.isArray(state?.versions) ? state.versions : []
    if (!list.length) return false

    versions.value = list.map((item) => cloneVersionEntry(item)).filter(Boolean)
    if (!versions.value.length) return false

    const activeId = String(state.activeVersionId || '').trim()
    activeVersionId.value = versions.value.some((item) => item.id === activeId)
      ? activeId
      : versions.value[0].id

    pendingHistoryRestore = null
    return true
  }

  function removeVersion(versionId) {
    if (versions.value.length <= 1) return null

    const targetId = String(versionId || '').trim()
    if (!targetId) return null

    const index = versions.value.findIndex((item) => item.id === targetId)
    if (index === -1) return null

    const removed = versions.value[index]
    const wasActive = activeVersionId.value === targetId
    const nextVersions = versions.value.filter((item) => item.id !== targetId)
    versions.value = nextVersions

    let switchedTo = null
    if (wasActive) {
      switchedTo = nextVersions[Math.min(index, nextVersions.length - 1)] || null
      if (switchedTo) {
        activeVersionId.value = switchedTo.id
        queueHistoryRestore({
          historyPast: switchedTo.historyPast,
          historyCurrent: switchedTo.historyCurrent,
          historyFuture: switchedTo.historyFuture,
          baselineBodyHtml: switchedTo.baselineBodyHtml,
        })
      }
    }

    return { removed, switchedTo, wasActive }
  }

  return {
    versions,
    activeVersionId,
    activeVersion,
    versionCount,
    resetVersions,
    queueHistoryRestore,
    consumePendingHistoryRestore,
    flushVersionState,
    createNextVersion,
    selectVersion,
    getVersionHtml,
    updateActiveVersionHtml,
    removeVersion,
    exportVersionState,
    importVersionState,
  }
}
