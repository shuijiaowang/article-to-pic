export const navItems = [
  { path: '/', label: '首页' },
  { path: '/documents', label: '文稿管理' },
  { path: '/visual-editor', label: '可视化编辑', activePrefix: '/visual-editor' },
  { path: '/settings', label: '设置' },
] as const

export type NavItem = (typeof navItems)[number]
