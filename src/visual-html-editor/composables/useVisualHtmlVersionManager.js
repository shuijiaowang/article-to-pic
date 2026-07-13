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

export function createVersionEntry(id, html) {
  const payload = String(html ?? '')
  return {
    id,
    savedHtml: payload,
    historyPast: [],
    historyCurrent: null,
    historyFuture: [],
    baselineBodyHtml: '',
    createdAt: Date.now(),
  }
}

export function useVisualHtmlVersionManager() {
  const versions = ref([])
  const activeVersionId = ref(0)
  let nextVersionId = 1
  let pendingHistoryRestore = null

  const activeVersion = computed(() =>
    versions.value.find((item) => item.id === activeVersionId.value) || null,
  )

  const versionCount = computed(() => versions.value.length)

  function resetVersions(html) {
    const entry = createVersionEntry(1, html)
    versions.value = [entry]
    activeVersionId.value = 1
    nextVersionId = 2
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
    version.savedHtml = String(snapshot.html ?? '')
    version.historyPast = cloneSnapshotList(snapshot.historyPast)
    version.historyCurrent = cloneSnapshot(snapshot.historyCurrent)
    version.historyFuture = cloneSnapshotList(snapshot.historyFuture)
    version.baselineBodyHtml = String(snapshot.baselineBodyHtml ?? '')
  }

  function createNextVersion(html) {
    const entry = createVersionEntry(nextVersionId, html)
    nextVersionId += 1
    versions.value = [...versions.value, entry]
    activeVersionId.value = entry.id
    queueHistoryRestore(null)
    return entry
  }

  function selectVersion(versionId) {
    const targetId = Number(versionId)
    if (!Number.isFinite(targetId) || targetId <= 0) return null
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
    const target = versions.value.find((item) => item.id === Number(versionId))
    return target ? String(target.savedHtml ?? '') : ''
  }

  function updateActiveVersionHtml(html) {
    const version = activeVersion.value
    if (!version) return
    version.savedHtml = String(html ?? '')
  }

  function cloneVersionEntry(version) {
    if (!version) return null
    return {
      id: version.id,
      savedHtml: String(version.savedHtml ?? ''),
      historyPast: cloneSnapshotList(version.historyPast),
      historyCurrent: cloneSnapshot(version.historyCurrent),
      historyFuture: cloneSnapshotList(version.historyFuture),
      baselineBodyHtml: String(version.baselineBodyHtml ?? ''),
      createdAt: Number(version.createdAt) || Date.now(),
    }
  }

  function exportVersionState() {
    return {
      versions: versions.value.map(cloneVersionEntry),
      activeVersionId: activeVersionId.value,
      nextVersionId,
    }
  }

  function importVersionState(state) {
    const list = Array.isArray(state?.versions) ? state.versions : []
    if (!list.length) return false

    versions.value = list.map((item) => cloneVersionEntry(item)).filter(Boolean)
    if (!versions.value.length) return false

    const activeId = Number(state.activeVersionId)
    activeVersionId.value = versions.value.some((item) => item.id === activeId)
      ? activeId
      : versions.value[0].id

    const maxId = Math.max(...versions.value.map((item) => item.id))
    const importedNext = Number(state.nextVersionId)
    nextVersionId = Number.isFinite(importedNext) && importedNext > maxId
      ? importedNext
      : maxId + 1
    pendingHistoryRestore = null
    return true
  }

  function removeVersion(versionId) {
    if (versions.value.length <= 1) return null

    const targetId = Number(versionId)
    if (!Number.isFinite(targetId) || targetId <= 0) return null

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
