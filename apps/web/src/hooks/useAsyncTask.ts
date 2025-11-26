import { useCallback, useState } from "react";

export type AsyncPhase = "idle" | "loading" | "success" | "error";

export interface AsyncStatus {
  phase: AsyncPhase;
  message: string | null;
}

interface UseAsyncTaskOptions<TResult> {
  loadingMessage?: string;
  successMessage?: string | ((result: TResult) => string | null);
  errorMessage?: (error: Error) => string;
  onSuccess?: (result: TResult) => void;
  onError?: (error: Error) => void;
}

/**
 * 轻量封装异步调用，统一 loading / success / error 状态与提示。
 */
export function useAsyncTask<TArgs extends any[], TResult>(
  task: (...args: TArgs) => Promise<TResult>,
  options?: UseAsyncTaskOptions<TResult>
) {
  const [status, setStatus] = useState<AsyncStatus>({ phase: "idle", message: null });

  const run = useCallback(
    async (...args: TArgs) => {
      setStatus({ phase: "loading", message: options?.loadingMessage ?? null });
      try {
        const result = await task(...args);
        const message =
          typeof options?.successMessage === "function"
            ? options.successMessage(result)
            : options?.successMessage ?? null;
        setStatus({ phase: "success", message });
        options?.onSuccess?.(result);
        return result;
      } catch (error) {
        const err = error as Error;
        const message = options?.errorMessage ? options.errorMessage(err) : err.message;
        setStatus({ phase: "error", message });
        options?.onError?.(err);
        throw err;
      }
    },
    [
      task,
      options?.loadingMessage,
      options?.successMessage,
      options?.errorMessage,
      options?.onSuccess,
      options?.onError
    ]
  );

  const reset = useCallback(() => setStatus({ phase: "idle", message: null }), []);

  const set = useCallback((phase: AsyncPhase, message: string | null) => {
    setStatus({ phase, message });
  }, []);

  return { run, status, reset, setStatus: set };
}
