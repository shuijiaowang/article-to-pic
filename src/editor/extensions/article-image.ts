import Image from '@tiptap/extension-image'

/** 文稿图片：持久化为 asset:// + data-asset-id + 宽高元数据 */
export const ArticleImage = Image.extend({
  name: 'articleImage',

  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      dataAssetId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-asset-id'),
        renderHTML: (attributes) =>
          attributes.dataAssetId ? { 'data-asset-id': attributes.dataAssetId } : {},
      },
      dataWidth: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-width'),
        renderHTML: (attributes) =>
          attributes.dataWidth != null ? { 'data-width': String(attributes.dataWidth) } : {},
      },
      dataHeight: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-height'),
        renderHTML: (attributes) =>
          attributes.dataHeight != null ? { 'data-height': String(attributes.dataHeight) } : {},
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'img[data-asset-id]' },
      { tag: 'img[src]' },
    ]
  },
})
