import {
  deleteDirectoryHandle,
  getDirectoryHandle,
  saveDirectoryHandle,
  type DirectoryHandleRecord,
} from '@/storage/db'

export async function bindDirectoryHandle(
  articleId: string,
  directoryHandle: FileSystemDirectoryHandle,
): Promise<DirectoryHandleRecord> {
  const record: DirectoryHandleRecord = {
    articleId,
    directoryHandle,
    boundAt: Date.now(),
  }
  await saveDirectoryHandle(record)
  return record
}

export async function getBoundDirectoryHandle(
  articleId: string,
): Promise<FileSystemDirectoryHandle | null> {
  const record = await getDirectoryHandle(articleId)
  return record?.directoryHandle ?? null
}

export async function unbindDirectoryHandle(articleId: string): Promise<void> {
  await deleteDirectoryHandle(articleId)
}

export async function isArticleBound(articleId: string): Promise<boolean> {
  const record = await getDirectoryHandle(articleId)
  return Boolean(record?.directoryHandle)
}
