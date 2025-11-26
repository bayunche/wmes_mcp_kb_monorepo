import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode
} from "react";
import clsx from "clsx";

type ToastTone = "info" | "success" | "warning" | "danger";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
}

interface ToastContextValue {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, "id">) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      // 鍙繚鐣欐渶鏂颁竴鏉★紝閬垮厤鍚屽睆杩囧
      setToasts([{ ...toast, id }]);
      // 鑷姩鍏抽棴
      setTimeout(() => dismiss(id), 3600);
      return id;
    },
    [dismiss]
  );

  const clear = useCallback(() => setToasts([]), []);

  const value = useMemo(() => ({ toasts, push, dismiss, clear }), [toasts, push, dismiss, clear]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

const ToastViewport = React.memo(function ToastViewport({
  toasts,
  onDismiss
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="toast-stack fixed top-4 right-4 z-50 flex flex-col gap-3">
      {toasts.map((toast) => (
        <div key={toast.id} className={clsx("toast", toast.tone ?? "info")}>
          <div className="toast__body">
            <strong>{toast.title}</strong>
            {toast.description && <p>{toast.description}</p>}
          </div>
          <button className="toast__close" onClick={() => onDismiss(toast.id)} aria-label="关闭提示">
            ×
          </button>
        </div>
      ))}
    </div>
  );
});

