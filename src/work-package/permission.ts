export async function ensureDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite',
): Promise<PermissionState> {
  const current = await handle.queryPermission({ mode })
  if (current === 'granted') return current
  return handle.requestPermission({ mode })
}

export function isDirectoryPickerSupported(): boolean {
  return typeof window.showDirectoryPicker === 'function'
}
