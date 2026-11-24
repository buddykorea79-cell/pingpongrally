import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, ExternalLink, Link2, X } from 'lucide-react'
import type { Attachment } from '@/lib/types'
import { cn, formatBytes, hostnameOf } from '@/lib/utils'
import { fileIconTone } from '@/lib/files'

export function AttachmentList({
  items,
  className,
  size = 'md',
  onRemove,
  tone = 'light',
}: {
  items: Attachment[]
  className?: string
  size?: 'sm' | 'md'
  onRemove?: (index: number) => void
  tone?: 'light' | 'dark'
}) {
  const [lightbox, setLightbox] = useState<Attachment | null>(null)
  if (!items.length) return null
  const images = items.map((a, i) => ({ a, i })).filter((x) => x.a.kind === 'image')
  const others = items.map((a, i) => ({ a, i })).filter((x) => x.a.kind !== 'image')
  return (
    <div className={cn('space-y-2', className)}>
      {images.length > 0 && (
        <div className={cn('grid gap-1.5', images.length === 1 ? 'grid-cols-1' : 'grid-cols-2', size === 'sm' && 'max-w-[280px]')}>
          {images.map(({ a, i }) => (
            <div key={i} className="group relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightbox(a)
                }}
                className={cn(
                  'block w-full overflow-hidden rounded-2xl bg-surface-3 ring-1 ring-inset ring-line',
                  images.length === 1 ? 'max-h-80' : 'aspect-[4/3]',
                )}
                style={images.length === 1 && a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
              >
                <img
                  src={a.thumb_url || a.url}
                  alt={a.name}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </button>
              {onRemove && <RemoveButton onClick={() => onRemove(i)} />}
            </div>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {others.map(({ a, i }) => (
            <div key={i} className="relative max-w-full">
              {a.kind === 'link' ? <LinkChip a={a} tone={tone} /> : <FileChip a={a} tone={tone} />}
              {onRemove && <RemoveButton onClick={() => onRemove(i)} />}
            </div>
          ))}
        </div>
      )}
      {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-ink-900 text-white shadow-raised ring-2 ring-surface transition hover:scale-110"
      aria-label="첨부 빼기"
    >
      <X className="size-3.5" />
    </button>
  )
}

function LinkChip({ a, tone }: { a: Attachment; tone: 'light' | 'dark' }) {
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'group flex max-w-full items-center gap-2.5 rounded-2xl py-2 pl-2 pr-3.5 text-left ring-1 ring-inset transition',
        tone === 'light' ? 'bg-surface-2 ring-line hover:bg-surface-3' : 'bg-white/8 ring-white/12 hover:bg-white/12',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-pong-500/12 text-pong-500">
        <Link2 className="size-4" />
      </span>
      <span className="min-w-0">
        <span className={cn('block truncate text-[13px] font-semibold', tone === 'light' ? 'text-fg' : 'text-white')}>
          {a.name && a.name !== a.url ? a.name : hostnameOf(a.url)}
        </span>
        <span className={cn('block truncate text-xs', tone === 'light' ? 'text-fg-3' : 'text-white/50')}>{hostnameOf(a.url)}</span>
      </span>
      <ExternalLink className={cn('size-3.5 shrink-0 opacity-0 transition group-hover:opacity-100', tone === 'light' ? 'text-fg-3' : 'text-white/60')} />
    </a>
  )
}

function FileChip({ a, tone }: { a: Attachment; tone: 'light' | 'dark' }) {
  const icon = fileIconTone(a.name)
  return (
    <a
      href={a.url}
      download={a.name}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'group flex max-w-full items-center gap-2.5 rounded-2xl py-2 pl-2 pr-3.5 ring-1 ring-inset transition',
        tone === 'light' ? 'bg-surface-2 ring-line hover:bg-surface-3' : 'bg-white/8 ring-white/12 hover:bg-white/12',
      )}
    >
      <span className={cn('flex h-8 w-7 shrink-0 items-center justify-center rounded-lg text-[8.5px] font-extrabold tracking-tight', icon.tone)}>
        {icon.label}
      </span>
      <span className="min-w-0">
        <span className={cn('block max-w-[220px] truncate text-[13px] font-semibold', tone === 'light' ? 'text-fg' : 'text-white')}>{a.name}</span>
        <span className={cn('block text-xs', tone === 'light' ? 'text-fg-3' : 'text-white/50')}>{formatBytes(a.size) || '파일'}</span>
      </span>
      <Download className={cn('size-3.5 shrink-0 opacity-50 transition group-hover:opacity-100', tone === 'light' ? 'text-fg-2' : 'text-white')} />
    </a>
  )
}

export function Lightbox({ item, onClose }: { item: Attachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[120] flex animate-fade-in flex-col bg-ink-950/92 backdrop-blur-sm" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="truncate text-sm font-medium text-white/80">{item.name}</p>
        <div className="flex items-center gap-1">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="size-4" /> 원본
          </a>
          <button className="rounded-xl p-2 text-white/80 hover:bg-white/10 hover:text-white" aria-label="닫기">
            <X className="size-5" />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0">
        <img src={item.url} alt={item.name} className="max-h-full max-w-full animate-scale-in rounded-xl object-contain shadow-pop" onClick={(e) => e.stopPropagation()} />
      </div>
    </div>,
    document.body,
  )
}
