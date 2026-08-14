import { toast } from "sonner";

export type ToastType = "success" | "error";

export interface ToastData {
  id: number;
  message: string;
  type: ToastType;
}

// ToastContainer is a no-op — the Toaster component in main.tsx handles rendering
export function ToastContainer(_props: { toasts?: ToastData[]; onDismiss?: (id: number) => void }) {
  return <></>;
}

// useToast wraps sonner's toast() to keep the same interface
export function useToast() {
  const show = (message: string, type: ToastType = "success") => {
    if (type === "success") {
      toast.success(message);
    } else {
      toast.error(message);
    }
  };

  const dismiss = (_id: number) => {
    // sonner handles dismissal automatically
  };

  return { toasts: [] as ToastData[], show, dismiss };
}
