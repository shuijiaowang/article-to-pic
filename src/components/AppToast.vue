<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { useToast, type ToastKind } from '@/composables/useToast'

const { visible, message, kind, hideToast } = useToast()

const icon = computed(() => {
  const icons: Record<ToastKind, string> = {
    success: '✓',
    error: '!',
    info: 'i',
  }
  return icons[kind.value]
})

onUnmounted(hideToast)
</script>

<template>
  <transition name="app-toast-fade">
    <div
      v-if="visible"
      class="app-toast"
      :class="kind"
      role="status"
      aria-live="polite"
    >
      <span class="app-toast-icon" aria-hidden="true">{{ icon }}</span>
      <span class="app-toast-text">{{ message }}</span>
    </div>
  </transition>
</template>

<style scoped>
.app-toast {
  position: fixed;
  top: 20px;
  left: 50%;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 12px 18px;
  border-radius: 12px;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
  font-size: 14px;
  line-height: 1.45;
  color: #1a1a1a;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(229, 229, 234, 0.95);
  box-shadow:
    0 4px 6px rgba(0, 0, 0, 0.04),
    0 12px 32px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(12px);
  transform: translateX(-50%);
  pointer-events: none;
}

.app-toast-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.app-toast-text {
  flex: 1;
  font-weight: 500;
}

.app-toast.info .app-toast-icon {
  color: #6b7280;
  background: #f3f4f6;
}

.app-toast.success .app-toast-icon {
  color: #fff;
  background: #7c3aed;
}

.app-toast.success {
  border-color: rgba(196, 181, 253, 0.6);
  box-shadow:
    0 4px 6px rgba(124, 58, 237, 0.06),
    0 12px 32px rgba(124, 58, 237, 0.12);
}

.app-toast.error .app-toast-icon {
  color: #fff;
  background: #dc2626;
}

.app-toast.error {
  color: #991b1b;
  background: rgba(254, 242, 242, 0.96);
  border-color: rgba(254, 202, 202, 0.9);
}

.app-toast-fade-enter-active,
.app-toast-fade-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.22s ease;
}

.app-toast-fade-enter-from,
.app-toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-12px);
}
</style>
