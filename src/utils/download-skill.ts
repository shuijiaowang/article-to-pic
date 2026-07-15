import skillMd from '../../skill-pack/SKILL.md?raw'

/** 下载 Article to Pic 本地创作 SKILL.md */
export function downloadSkillFile() {
  const blob = new Blob([skillMd], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'SKILL.md'
  link.click()
  URL.revokeObjectURL(url)
}
