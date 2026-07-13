import { describe, expect, it } from 'vitest'
import { buildEditChangeLog, formatEditChangeLogForAi, getDomPath } from './editChangeLog.js'

function createBodies({ baselineHtml, currentHtml }) {
  const doc = document.implementation.createHTMLDocument('')
  const baselineBody = doc.body
  baselineBody.innerHTML = baselineHtml

  const currentDoc = document.implementation.createHTMLDocument('')
  const currentBody = currentDoc.body
  currentBody.innerHTML = currentHtml

  return { baselineBody, currentBody }
}

describe('editChangeLog', () => {
  it('resolves DOM paths with interleaved sibling tags', () => {
    const { baselineBody, currentBody } = createBodies({
      baselineHtml: '<div><p id="a"></p><span></span><p id="b"></p></div>',
      currentHtml: '<div><p id="a"></p><span></span><p id="b">changed</p></div>',
    })

    const target = currentBody.querySelector('#b')
    const entries = buildEditChangeLog(currentBody, baselineBody.innerHTML)

    expect(getDomPath(target, currentBody)).toBe('div:nth-child(1) > p:nth-child(3)')
    expect(entries).toHaveLength(1)
    expect(entries[0].attributeChanges[0].after).toBe('changed')
  })

  it('returns no entries when content is unchanged', () => {
    const html = '<div><p>hello</p></div>'
    const { currentBody } = createBodies({ baselineHtml: html, currentHtml: html })
    expect(buildEditChangeLog(currentBody, html)).toEqual([])
    expect(formatEditChangeLogForAi([])).toContain('暂无检测到')
  })

  it('reports leaf child content without parent innerHTML noise', () => {
    const baseline = '<div><p>before <span id="t">old</span> after</p></div>'
    const current = '<div><p>before <span id="t">new</span> after</p></div>'
    const { currentBody } = createBodies({ baselineHtml: baseline, currentHtml: current })

    const entries = buildEditChangeLog(currentBody, baseline)
    expect(entries).toHaveLength(1)
    expect(entries[0].tag).toBe('span')
    expect(entries[0].attributeChanges[0]).toMatchObject({
      kind: 'content',
      name: 'innerHTML',
      before: 'old',
      after: 'new',
    })
  })

  it('keeps full content text without truncation', () => {
    const longText = 'x'.repeat(500)
    const baseline = `<p>${'a'.repeat(500)}</p>`
    const current = `<p>${longText}</p>`
    const { currentBody } = createBodies({ baselineHtml: baseline, currentHtml: current })

    const entries = buildEditChangeLog(currentBody, baseline)
    expect(entries[0].attributeChanges[0].after).toBe(longText)
    expect(entries[0].attributeChanges[0].after).toHaveLength(500)
  })

  it('detects inline style changes', () => {
    const baseline = '<p>text</p>'
    const current = '<p style="color: red !important;">text</p>'
    const { currentBody } = createBodies({ baselineHtml: baseline, currentHtml: current })

    const entries = buildEditChangeLog(currentBody, baseline)
    expect(entries).toHaveLength(1)
    expect(entries[0].styleChanges).toEqual([
      { kind: 'add', property: 'color', after: 'red !important' },
    ])
  })

  it('reports changes on multiple siblings with different tags', () => {
    const baseline = '<div><input id="a" /><button id="b" /></div>'
    const current = '<div><input id="a" style="height: 40px !important;" /><button id="b" style="height: 50px !important;" /></div>'
    const { currentBody } = createBodies({ baselineHtml: baseline, currentHtml: current })

    const entries = buildEditChangeLog(currentBody, baseline)
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.id).sort()).toEqual(['a', 'b'])
    expect(entries.every((e) => e.styleChanges.some((c) => c.property === 'height'))).toBe(true)
  })
})
