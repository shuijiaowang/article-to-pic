import { ASSETS_DIR, HTML_FILE, MANIFEST_FILE, MD_FILE } from '@/work-package/types'
import { assertSafeAssetFilename } from '@/work-package/paths'

export async function readTextFile(handle: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try {
    const fileHandle = await handle.getFileHandle(name)
    const file = await fileHandle.getFile()
    return await file.text()
  } catch {
    return null
  }
}

export async function writeTextFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  content: string,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(content)
  await writable.close()
}

export async function writeBlobFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  blob: Blob,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(blob)
  await writable.close()
}

export async function getAssetsDirectory(
  root: FileSystemDirectoryHandle,
  create = false,
): Promise<FileSystemDirectoryHandle> {
  return root.getDirectoryHandle(ASSETS_DIR, { create })
}

export async function listAssetFilenames(root: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = []
  try {
    const assetsDir = await root.getDirectoryHandle(ASSETS_DIR)
    for await (const name of assetsDir.keys()) {
      try {
        names.push(assertSafeAssetFilename(name))
      } catch {
        // skip unsafe names
      }
    }
  } catch {
    // no assets dir
  }
  return names.sort()
}

export async function readAssetFile(
  root: FileSystemDirectoryHandle,
  filename: string,
): Promise<File | null> {
  try {
    const assetsDir = await root.getDirectoryHandle(ASSETS_DIR)
    const fileHandle = await assetsDir.getFileHandle(assertSafeAssetFilename(filename))
    return fileHandle.getFile()
  } catch {
    return null
  }
}

export async function writeAssetFile(
  root: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob,
): Promise<void> {
  const assetsDir = await getAssetsDirectory(root, true)
  await writeBlobFile(assetsDir, assertSafeAssetFilename(filename), blob)
}

export async function removeAssetFile(
  root: FileSystemDirectoryHandle,
  filename: string,
): Promise<void> {
  try {
    const assetsDir = await root.getDirectoryHandle(ASSETS_DIR)
    await assetsDir.removeEntry(assertSafeAssetFilename(filename))
  } catch {
    // ignore missing
  }
}

export function fileFingerprint(file: File): string {
  return `${file.size}:${file.lastModified}`
}

export { HTML_FILE, MANIFEST_FILE, MD_FILE }
