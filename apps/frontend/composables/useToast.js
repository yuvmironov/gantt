let sequence = 0;

export function useToast() {
  const toasts = useState('toasts', () => []);

  function dismiss(id) {
    toasts.value = toasts.value.filter((item) => item.id !== id);
  }

  function push(message, type = 'info', duration = 5000) {
    const text = String(message ?? '').trim();
    if (!text) return;
    if (toasts.value.some((item) => item.message === text && item.type === type)) return;
    const id = ++sequence;
    toasts.value.push({ id, message: text, type });
    if (toasts.value.length > 5) toasts.value.shift();
    if (import.meta.client) {
      setTimeout(() => dismiss(id), duration);
    }
  }

  return {
    toasts,
    push,
    dismiss,
    error: (message, duration = 7000) => push(message, 'error', duration),
    success: (message, duration = 4000) => push(message, 'success', duration),
    info: (message, duration = 5000) => push(message, 'info', duration),
  };
}
