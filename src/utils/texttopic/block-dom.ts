/** 页内排版单元 DOM：.page 的直接子节点为测量单位 */

import { OVERFLOW_CUT_ATTR } from '@/utils/texttopic/overflow-visual'

const SYSTEM_BLOCK_CLASSES = new Set(['block', 'block--overflow'])

/** .page 下参与测量/溢出的直接子节点 */
export function queryPageBlocks(page: HTMLElement): HTMLElement[] {
  return [...page.children].filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && !el.hasAttribute(OVERFLOW_CUT_ATTR),
  )
}

/** 布局报告标签：class 名，否则标签名 */
export function getBlockRole(block: HTMLElement): string {
  const roles = [...block.classList].filter((c) => !SYSTEM_BLOCK_CLASSES.has(c))
  if (roles.length) return roles.join('.')
  return block.tagName.toLowerCase()
}

/** 是否含图片（data-asset-id 或 img） */
export function isImageContentBlock(block: HTMLElement): boolean {
  if (block.getAttribute('data-asset-id')) return true
  return Boolean(block.querySelector('img[data-asset-id], img'))
}

/** 预览占位 / 点击上传：尚未有 src 的配图单元 */
export function queryPendingImageBlocks(root: ParentNode): HTMLElement[] {
  const candidates = new Set<HTMLElement>()

  const pushUnit = (el: HTMLElement | null) => {
    if (!el) return
    const unit =
      (el.closest('.page > *') as HTMLElement | null) ??
      (el.classList.contains('block') || el.hasAttribute('data-id') ? el : null)
    if (!unit) return
    if (unit.querySelector('img[src]')) return
    const isImageUnit =
      Boolean(unit.getAttribute('data-asset-id')) ||
      Boolean(unit.querySelector('img, [data-asset-id]')) ||
      Boolean(unit.getAttribute('data-placeholder'))
    if (!isImageUnit) return
    candidates.add(unit)
  }

  root.querySelectorAll('[data-asset-id], img').forEach((node) => {
    pushUnit(node as HTMLElement)
  })

  return [...candidates]
}
