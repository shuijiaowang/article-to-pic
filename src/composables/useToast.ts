import { ref } from 'vue'

export type ToastKind = 'info' | 'success' | 'error'

const DEFAULT_DURATION = 2200

const visible = ref(false)
const message = ref('')
const kind = ref<ToastKind>('info')

let timer: ReturnType<typeof setTimeout> | undefined

function hideToast() {
  visible.value = false
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
}

function showToast(type: ToastKind, text: string, duration = DEFAULT_DURATION) {
  kind.value = type
  message.value = text
  visible.value = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(hideToast, duration)
}

export function useToast() {
  return {
    visible,
    message,
    kind,
    showToast,
    hideToast,
  }
}
