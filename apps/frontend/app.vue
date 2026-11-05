<script setup>
const { toasts, dismiss } = useToast();
</script>

<template>
  <NuxtPage />
  <div class="toast-stack" aria-live="polite" aria-atomic="false">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast-item"
      :class="toast.type"
      role="status"
    >
      <span class="toast-message">{{ toast.message }}</span>
      <button class="toast-close" type="button" aria-label="Закрыть" @click="dismiss(toast.id)">×</button>
    </div>
  </div>
</template>

<style>
.toast-stack {
  position: fixed;
  top: 76px;
  right: 20px;
  z-index: 500;
  display: grid;
  gap: 8px;
  width: min(380px, calc(100vw - 32px));
  pointer-events: none;
}

.toast-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-left: 4px solid #64748b;
  border-radius: var(--radius-lg, 10px);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
  animation: toast-in 160ms ease-out;
}

.toast-item.error {
  border-left-color: var(--color-danger);
  background: #fff7f7;
}

.toast-item.success {
  border-left-color: #16a34a;
  background: #f6fff9;
}

.toast-item.info {
  border-left-color: #2563eb;
}

.toast-message {
  flex: 1;
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.toast-close {
  flex: 0 0 auto;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 640px) {
  .toast-stack {
    top: 12px;
    right: 12px;
    width: calc(100vw - 24px);
  }
}
</style>
