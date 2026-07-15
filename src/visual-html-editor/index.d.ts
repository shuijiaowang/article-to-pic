import type { Component } from 'vue'

export interface VisualHtmlEditorExpose {
  getHtml(): string
  getActiveVersionHtml?: () => string
  resetBaselineAfterCommit(html?: string): void
  reload(html: string): void | Promise<void>
  clearPersistedDraft(): boolean
  flushPersistedDraft?: () => boolean
  importAsNewVersion?: (
    html: string,
    meta?: { label?: string; summary?: string; id?: string },
  ) => Promise<{ id: string; html: string; label?: string } | null>
}

export const VisualHtmlEditor: Component

export function useVisualHtmlEditor(options?: Record<string, unknown>): Record<string, unknown>
export function useVisualHtmlPersistence(options?: Record<string, unknown>): Record<string, unknown>
export function useVisualHtmlVersionManager(options?: Record<string, unknown>): Record<string, unknown>
