import { useRef, useState } from 'react'
import { cn, normalizeCode } from '@/lib/utils'

/** 6자리 입장 코드 입력: 실제 입력창 하나 위에 칸 6개를 그린다(붙여넣기·모바일 키보드 호환). */
export function CodeInput({
  value,
  onChange,
  onComplete,
  invalid,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  invalid?: boolean
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  return (
    <div className={cn('relative', invalid && 'animate-[shake_0.4s_ease-in-out]')} onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const v = normalizeCode(e.target.value)
          onChange(v)
          if (v.length === 6) onComplete?.(v)
        }}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={12}
        aria-label="입장 코드 숫자 6자리"
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <div className="grid grid-cols-6 gap-2" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => {
          const ch = value[i]
          const active = focused && (i === value.length || (value.length === 6 && i === 5))
          return (
            <div
              key={i}
              className={cn(
                'relative flex aspect-[4/5] items-center justify-center rounded-lg bg-surface font-mono text-[24px] font-light uppercase text-fg ring-1 ring-inset transition-all duration-150 sm:text-[28px]',
                ch ? 'ring-fg-3/50' : 'ring-line-strong',
                active && 'ring-fg',
                invalid && 'ring-danger',
              )}
            >
              {ch ? <span className="animate-scale-in">{ch}</span> : active && <span className="h-6 w-px animate-pulse bg-fg" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
