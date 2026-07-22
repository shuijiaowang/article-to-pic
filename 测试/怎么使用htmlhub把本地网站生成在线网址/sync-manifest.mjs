#!/usr/bin/env node
/**
 * 扫描工作包 assets/，为新图分配 UUID、读取宽高，更新 manifest.json。
 * 零依赖，在工作包根目录执行：node sync-manifest.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const MIME_MAP = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}
const ALLOWED_EXTS = new Set(Object.keys(MIME_MAP))
const SCHEMA_VERSION = 1

function readImageSize(buf) {
  if (buf.length < 24) return { width: 0, height: 0 }

  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }

  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  }

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length - 8) {
      if (buf[i] !== 0xff) break
      const marker = buf[i + 1]
      const len = buf.readUInt16BE(i + 2)
      if (marker === 0xc0 || marker === 0xc2 || marker === 0xc1) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
      }
      i += 2 + len
    }
  }

  // WebP (RIFF)
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16)
    if (chunk === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
    }
    if (chunk === 'VP8L') {
      const bits = buf.readUInt32LE(21)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (chunk === 'VP8X' && buf.length >= 30) {
      return {
        width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
        height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
      }
    }
  }

  return { width: 0, height: 0 }
}

const pkgDir = process.cwd()
const manifestPath = join(pkgDir, 'manifest.json')
const assetsDir = join(pkgDir, 'assets')

let manifest
if (existsSync(manifestPath)) {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
} else {
  manifest = {
    schemaVersion: SCHEMA_VERSION,
    packageId: randomUUID(),
    title: '未命名文稿',
    updatedAt: new Date().toISOString(),
    activeHtmlFile: 'article.html',
    assets: {},
  }
}

const pathToId = new Map()
for (const [id, entry] of Object.entries(manifest.assets)) {
  pathToId.set(entry.path, id)
}

const diskFiles = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter((f) => {
      const ext = f.slice(f.lastIndexOf('.')).toLowerCase()
      return ALLOWED_EXTS.has(ext)
    })
  : []

const added = []
const updated = []
const removed = []
const seenPaths = new Set(diskFiles)

for (const filename of diskFiles) {
  const filePath = join(assetsDir, filename)
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  const mime = MIME_MAP[ext] || 'application/octet-stream'
  const bytes = statSync(filePath).size
  const buf = readFileSync(filePath)
  const { width, height } = readImageSize(buf)

  const existingId = pathToId.get(filename)
  if (existingId) {
    const entry = manifest.assets[existingId]
    if (entry.width !== width || entry.height !== height || entry.bytes !== bytes) {
      Object.assign(entry, { mime, width, height, bytes })
      updated.push(filename)
    }
  } else {
    const id = randomUUID()
    manifest.assets[id] = { path: filename, mime, width, height, bytes, sha256: null }
    pathToId.set(filename, id)
    added.push(filename)
  }
}

for (const [id, entry] of Object.entries(manifest.assets)) {
  if (!seenPaths.has(entry.path)) {
    removed.push(entry.path)
    delete manifest.assets[id]
  }
}

manifest.updatedAt = new Date().toISOString()
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')

if (added.length) {
  console.log(
    `新增: ${added
      .map((f) => {
        const id = pathToId.get(f)
        const e = manifest.assets[id]
        return `${f} (${e.width}×${e.height}) → ${id}`
      })
      .join('\n      ')}`,
  )
}
if (updated.length) console.log(`更新: ${updated.join(', ')}`)
if (removed.length) console.log(`移除: ${removed.join(', ')}`)
if (!added.length && !updated.length && !removed.length) console.log('manifest 已是最新，无变更')
