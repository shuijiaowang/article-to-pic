import type { Component } from 'vue'

export interface VisualHtmlEditorExpose {
  getHtml(): string
  resetBaselineAfterCommit(html?: string): void
  reload(html: string): void
  clearPersistedDraft(): boolean
}

export const VisualHtmlEditor: Component

export function useVisualHtmlEditor(options?: Record<string, unknown>): Record<string, unknown>
export function useVisualHtmlPersistence(options?: Record<string, unknown>): Record<string, unknown>
export function useVisualHtmlVersionManager(options?: Record<string, unknown>): Record<string, unknown>
