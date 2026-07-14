/// <reference types="vite/client" />

declare module '*.html?raw' {
  const content: string
  export default content
}

declare module '*.md?raw' {
  const content: string
  export default content
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface OpenFilePickerOptions {
  multiple?: boolean
  excludeAcceptAllOption?: boolean
  types?: Array<{
    description?: string
    accept: Record<string, string[]>
  }>
  mode?: 'read' | 'readwrite'
}

interface FileSystemFileHandle extends FileSystemHandle {
  getFile(): Promise<File>
  createWritable(): Promise<FileSystemWritableFileStream>
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface Window {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>
}

interface DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle>
}
