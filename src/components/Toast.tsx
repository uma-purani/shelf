import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

interface ToastState {
  id: number
  message: string
  undo?: () => Promise<void> | void
}

interface ToastApi {
  /** Show a message for a few seconds; with `undo`, include an Undo button. */
  show: (message: string, undo?: () => Promise<void> | void) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const DURATION_MS = 5000

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const nextId = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const dismiss = useCallback(() => {
    clearTimeout(timer.current)
    setToast(null)
  }, [])

  const show = useCallback((message: string, undo?: () => Promise<void> | void) => {
    clearTimeout(timer.current)
    setToast({ id: ++nextId.current, message, undo })
    timer.current = setTimeout(() => setToast(null), DURATION_MS)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role="status"
          className="fixed inset-x-0 z-50 mx-auto flex w-[calc(100%-2rem)] max-w-md items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-bg shadow-lg"
          // --bar-h is published by the screen's fixed bottom bar so the toast always clears it
          style={{ bottom: 'calc(var(--bar-h, 0px) + 1rem)' }}
        >
          <span className="min-w-0 truncate">{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              className="-my-2 -mr-2 shrink-0 rounded-lg px-3 py-2 font-semibold text-toast-accent active:opacity-60"
              onClick={async () => {
                const undo = toast.undo
                dismiss()
                await undo?.()
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  )
}
