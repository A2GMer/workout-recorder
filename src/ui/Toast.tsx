import { useEffect, useRef } from 'react'

/** 下に出る小さな通知。2.5 秒で自然に消える */
export function Toast({
  message,
  action,
  onAction,
  onClose,
}: {
  message: string
  action: string
  onAction: () => void
  onClose: () => void
}) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const t = setTimeout(() => close.current(), 2500)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center">
      <div
        role="status"
        className="pointer-events-auto flex h-11 items-center gap-4 rounded-full border border-line bg-panel pl-5 pr-2 text-sm"
      >
        <span>{message}</span>
        <button onClick={onAction} className="h-9 px-3 text-fg">
          {action}
        </button>
      </div>
    </div>
  )
}
