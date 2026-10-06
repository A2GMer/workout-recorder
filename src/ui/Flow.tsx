import type { ReactNode } from 'react'

/** 一方通行フローの見出し（画面ごとに1つの問い） */
export function Question({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="shrink-0 px-5 pt-4 pb-6 text-center">
      <h1 className="text-[26px] leading-tight">{children}</h1>
      {sub && <p className="mt-2 text-sm text-dim">{sub}</p>}
    </div>
  )
}

/** 画面下の主ボタン。押せる操作は常にここ */
export function PrimaryButton({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <div className="shrink-0 px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <button
        onClick={onClick}
        disabled={disabled}
        className="h-14 w-full rounded-full bg-fg text-base text-bg transition active:scale-[0.98] disabled:bg-chip disabled:text-faint"
      >
        {children}
      </button>
    </div>
  )
}
