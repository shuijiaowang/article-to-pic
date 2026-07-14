export const navItems = [
  { path: '/', label: '首页' },
  { path: '/documents', label: '文稿管理' },
  { path: '/visual-editor', label: 'HTML 工作台', activePrefix: '/preview' },
] as const

export type NavItem = (typeof navItems)[number]
