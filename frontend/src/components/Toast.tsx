import { useEffect, useState } from "react";

export type ToastType = "success" | "error";

export interface ToastData {
  id: number;
  message: string;
  type: ToastType;
}

interface Props {
  toasts: ToastData[];
  onDismiss: (id: number) => void;
}

export function ToastContainer({ toasts, onDismiss }: Props) {
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Fade in
    requestAnimationFrame(() => setVisible(true));
    // Auto-dismiss after 3s
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, 3000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  const isSuccess = toast.type === "success";

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-medium shadow-2xl transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      } ${
        isSuccess
          ? "bg-bg-secondary border-accent-green/30 text-accent-green"
          : "bg-bg-secondary border-accent-red/30 text-accent-red"
      }`}
    >
      <span>{isSuccess ? "✓" : "✕"}</span>
      <span>{toast.message}</span>
    </div>
  );
}

// Simple hook to manage toasts
let _nextId = 1;

export function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const show = (message: string, type: ToastType = "success") => {
    const id = _nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, show, dismiss };
}
