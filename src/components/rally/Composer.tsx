import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, FileText, ImagePlus, Link2, Loader2, Plus, X } from 'lucide-react'
import { backend } from '@/lib/backend'
import type { Attachment } from '@/lib/types'
import { ACCEPT_DOCS, ACCEPT_IMAGES, MAX_ATTACHMENTS, isImageFile, prepareImage, validateFile } from '@/lib/files'
import { cn, hostnameOf, isSubmitEnter, normalizeUrl } from '@/lib/utils'
import { errorMessage } from '@/lib/errors'
import { useToast } from '../ui/Feedback'
import { Button } from '../ui/Button'
import { CharCount, Textarea } from '../ui/Field'
import { AttachmentList } from './Attachments'

interface Pending {
  key: number
  name: string
  preview?: string
}

export interface ComposerProps {
  roomId: string
  onSubmit: (content: string, attachments: Attachment[]) => Promise<void>
  placeholder?: string
  maxLength?: number
  allowAttachments?: boolean
  submitLabel?: ReactNode
  tone?: 'pong' | 'ping'
  autoFocus?: boolean
  initialText?: string
  initialAttachments?: Attachment[]
  onCancel?: () => void
  onDirtyChange?: (dirty: boolean) => void
  footerHint?: ReactNode
  minRows?: number
  /** 창을 닫아도 쓰던 글을 남겨 둘 키(sessionStorage) */
  draftKey?: string
  /** 처음부터 붙여 둘 파일(화면 캡처를 붙여 넣어 작성기를 연 경우) */
  initialFiles?: File[]
  /** 입력창과 보내기 줄 사이에 넣을 내용(퀵폴 선택지 등) */
  extra?: ReactNode
  /** 보내기 전에 막을 일이 있으면 메시지를 돌려준다 */
  validate?: () => string | null
}

/**
 * 클립보드에서 파일(주로 화면 캡처)을 꺼낸다.
 * 글을 붙여 넣는 중이면(엑셀 셀처럼 글과 그림이 함께 오는 경우 포함) 글을 우선해 빈 배열을 돌려준다.
 */
export function clipboardFiles(dt: DataTransfer | null): File[] {
  if (!dt) return []
  if (dt.getData('text/plain').trim()) return []
  const files: File[] = []
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== 'file') continue
    const f = item.getAsFile()
    if (f) files.push(f)
  }
  if (!files.length) files.push(...Array.from(dt.files ?? []))
  const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '')
  return files.map((f, i) => {
    // 브라우저는 캡처를 모두 image.png 로 넘긴다 → 알아보기 쉬운 이름으로
    if (f.name && !/^image\.(png|jpe?g|gif|webp)$/i.test(f.name)) return f
    const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
    return new File([f], `화면캡처_${stamp}${i ? `_${i + 1}` : ''}.${ext}`, { type: f.type || 'image/png' })
  })
}

function readDraft(key?: string) {
  if (!key) return null
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

/** 퐁·핑 작성기. 전송 중에는 버튼을 잠가 같은 글이 두 번 올라가지 않게 한다(5.2). */
export function Composer({
  roomId,
  onSubmit,
  placeholder = '생각을 자유롭게 적어 주세요',
  maxLength = 1000,
  allowAttachments = true,
  submitLabel = '퐁 보내기',
  tone = 'pong',
  autoFocus,
  initialText = '',
  initialAttachments = [],
  onCancel,
  onDirtyChange,
  footerHint,
  minRows,
  draftKey,
  initialFiles,
  extra,
  validate,
}: ComposerProps) {
  const toast = useToast()
  const [text, setText] = useState(() => readDraft(draftKey) ?? initialText)
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments)
  const [pending, setPending] = useState<Pending[]>([])
  const [linkMode, setLinkMode] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [sending, setSending] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const seq = useRef(0)
  const area = useRef<HTMLTextAreaElement>(null)
  const root = useRef<HTMLDivElement>(null)

  const dirty = text.trim().length > 0 || attachments.length > 0
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  useEffect(() => {
    if (!draftKey) return
    try {
      if (text) sessionStorage.setItem(draftKey, text)
      else sessionStorage.removeItem(draftKey)
    } catch {
      /* 저장 공간이 없으면 넘어간다 */
    }
  }, [draftKey, text])
  useEffect(() => {
    if (autoFocus) setTimeout(() => area.current?.focus(), 60)
  }, [autoFocus])

  const total = attachments.length + pending.length

  async function addFiles(list: FileList | File[] | null) {
    if (!list || !list.length) return
    const files = Array.from(list).slice(0, Math.max(0, MAX_ATTACHMENTS - total))
    if (list.length > files.length) toast.show(`첨부는 ${MAX_ATTACHMENTS}개까지 붙일 수 있어요.`, 'info')
    for (const file of files) {
      const problem = validateFile(file)
      if (problem) {
        toast.show(problem, 'danger')
        continue
      }
      const key = ++seq.current
      const image = isImageFile(file)
      setPending((p) => [...p, { key, name: file.name, preview: image ? URL.createObjectURL(file) : undefined }])
      try {
        if (image) {
          const prepared = await prepareImage(file)
          const { url, thumb_url } = await backend.uploadFile(roomId, prepared.original, { name: file.name, thumb: prepared.thumb })
          setAttachments((a) => [
            ...a,
            { kind: 'image', url, thumb_url, name: file.name, mime: prepared.original.type, size: prepared.original.size, width: prepared.width, height: prepared.height },
          ])
        } else {
          const { url } = await backend.uploadFile(roomId, file, { name: file.name })
          setAttachments((a) => [...a, { kind: 'file', url, name: file.name, mime: file.type, size: file.size }])
        }
      } catch (e) {
        toast.show(errorMessage(e), 'danger')
      } finally {
        setPending((p) => {
          const it = p.find((x) => x.key === key)
          if (it?.preview) URL.revokeObjectURL(it.preview)
          return p.filter((x) => x.key !== key)
        })
      }
    }
  }

  // 화면 캡처 붙여 넣기: 작성기 안에서는 onPaste 가, 같은 창(모달) 어디서든은 문서 단위 리스너가 받는다.
  const addFilesRef = useRef(addFiles)
  addFilesRef.current = addFiles
  useEffect(() => {
    if (!allowAttachments) return
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented) return
      const el = root.current
      if (!el) return
      const target = e.target instanceof Element ? e.target : null
      if ((el.closest('[role=dialog]') ?? null) !== (target?.closest('[role=dialog]') ?? null)) return
      const files = clipboardFiles(e.clipboardData)
      if (!files.length) return
      e.preventDefault()
      void addFilesRef.current(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [allowAttachments])
  const initialDone = useRef(false)
  useEffect(() => {
    // 처음 한 번만(개발 모드의 effect 두 번 실행에도 한 번만 붙도록 ref 로 막는다)
    if (initialDone.current || !initialFiles?.length) return
    initialDone.current = true
    void addFilesRef.current(initialFiles)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function addLink() {
    const url = normalizeUrl(linkValue)
    if (!url) {
      toast.show('http 또는 https 로 시작하는 주소만 붙일 수 있어요.', 'danger')
      return
    }
    if (total >= MAX_ATTACHMENTS) return
    setAttachments((a) => [...a, { kind: 'link', url, name: hostnameOf(url) }])
    setLinkValue('')
    setLinkMode(false)
  }

  async function submit() {
    if (sending || pending.length > 0) return
    const content = text.trim()
    if (!content && attachments.length === 0) return
    if (content.length > maxLength) {
      toast.show(`${maxLength.toLocaleString()}자까지 쓸 수 있어요.`, 'danger')
      return
    }
    const problem = validate?.()
    if (problem) {
      toast.show(problem, 'danger')
      return
    }
    setSending(true)
    try {
      await onSubmit(content, attachments)
      setText('')
      setAttachments([])
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    } finally {
      setSending(false)
    }
  }

  const canSend = (text.trim().length > 0 || attachments.length > 0) && text.length <= maxLength && pending.length === 0

  return (
    <div
      ref={root}
      className="space-y-3"
      onPaste={(e) => {
        if (!allowAttachments) return
        const files = clipboardFiles(e.clipboardData)
        if (!files.length) return
        e.preventDefault()
        void addFiles(files)
      }}
    >
      <Textarea
        ref={area}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // 여러 줄 입력이 기본. Ctrl/⌘ + Enter 로 보낸다(한글 조합 중 Enter 는 무시).
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void submit()
          }
        }}
        placeholder={placeholder}
        className={cn('text-[16px]', minRows ? '' : 'min-h-[120px]')}
        style={minRows ? { minHeight: `${minRows * 26 + 24}px` } : undefined}
        maxRows={10}
      />

      {(attachments.length > 0 || pending.length > 0) && (
        <div className="space-y-2">
          <AttachmentList items={attachments} onRemove={(i) => setAttachments((a) => a.filter((_, j) => j !== i))} size="sm" />
          {pending.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pending.map((p) => (
                <div key={p.key} className="relative flex h-16 w-20 items-center justify-center overflow-hidden rounded-xl bg-surface-3 ring-1 ring-line">
                  {p.preview && <img src={p.preview} alt="" className="absolute inset-0 size-full object-cover opacity-50" />}
                  <Loader2 className="relative size-5 animate-spin text-fg-2" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {linkMode && (
        <div className="flex animate-fade-in gap-2">
          <input
            autoFocus
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onKeyDown={(e) => {
              if (isSubmitEnter(e)) {
                e.preventDefault()
                addLink()
              }
              if (e.key === 'Escape') setLinkMode(false)
            }}
            placeholder="https://"
            inputMode="url"
            className="h-10 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[15px] ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-pong-500"
          />
          <Button size="sm" variant="secondary" className="h-10" onClick={addLink}>
            추가
          </Button>
          <button className="rounded-xl px-2 text-fg-3 hover:text-fg" onClick={() => setLinkMode(false)} aria-label="링크 입력 닫기">
            <X className="size-4" />
          </button>
        </div>
      )}

      {extra}

      <div className="flex items-center gap-1">
        {allowAttachments && (
          <>
            <input ref={imageInput} type="file" accept={ACCEPT_IMAGES} multiple hidden onChange={(e) => (void addFiles(e.target.files), (e.target.value = ''))} />
            <input ref={fileInput} type="file" accept={ACCEPT_DOCS} multiple hidden onChange={(e) => (void addFiles(e.target.files), (e.target.value = ''))} />
            <ToolButton label="이미지" title="화면 캡처는 Ctrl+V로 바로 붙일 수 있어요" onClick={() => imageInput.current?.click()} disabled={total >= MAX_ATTACHMENTS}>
              <ImagePlus />
            </ToolButton>
            <ToolButton label="파일" onClick={() => fileInput.current?.click()} disabled={total >= MAX_ATTACHMENTS}>
              <FileText />
            </ToolButton>
            <ToolButton label="링크" onClick={() => setLinkMode((v) => !v)} disabled={total >= MAX_ATTACHMENTS} active={linkMode}>
              <Link2 />
            </ToolButton>
          </>
        )}
        <div className="ml-auto flex items-center gap-3">
          {footerHint && <span className="hidden text-xs text-fg-3 sm:inline">{footerHint}</span>}
          <CharCount value={text} max={maxLength} />
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              취소
            </Button>
          )}
          <Button
            variant={tone === 'ping' ? 'brand' : 'pong'}
            size="sm"
            className="h-10 pl-3.5 pr-4"
            loading={sending}
            disabled={!canSend}
            onClick={() => void submit()}
            icon={!sending && <ArrowUp className="size-4 stroke-[2.6]" />}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ToolButton({ label, title, onClick, children, disabled, active }: { label: string; title?: string; onClick: () => void; children: ReactNode; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-semibold transition disabled:opacity-40 [&_svg]:size-[18px]',
        active ? 'bg-pong-50 text-pong-600 dark:bg-pong-950 dark:text-pong-300' : 'text-fg-2 hover:bg-surface-3 hover:text-fg',
      )}
    >
      {children}
      <span className="hidden min-[400px]:inline">{label}</span>
    </button>
  )
}

/** 리플처럼 한 줄로 쓰는 입력창: Enter 로 보내되 한글 조합 중에는 보내지 않는다. */
export function InlineComposer({
  onSubmit,
  placeholder = '리플 달기',
  initial = '',
  autoFocus,
  maxLength = 1000,
}: {
  onSubmit: (text: string) => Promise<void>
  placeholder?: string
  initial?: string
  autoFocus?: boolean
  maxLength?: number
}) {
  const toast = useToast()
  const [text, setText] = useState(initial)
  const [sending, setSending] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    setText(initial)
    if (autoFocus || initial) {
      setTimeout(() => {
        const el = ref.current
        if (!el) return
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      }, 30)
    }
  }, [initial, autoFocus])
  async function submit() {
    const t = text.trim()
    if (!t || sending) return
    if (t.length > maxLength) return toast.show(`${maxLength.toLocaleString()}자까지 쓸 수 있어요.`, 'danger')
    setSending(true)
    try {
      await onSubmit(t)
      setText('')
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    } finally {
      setSending(false)
    }
  }
  return (
    <div className="flex items-end gap-2 rounded-2xl bg-surface-2 p-1.5 pl-3.5 ring-1 ring-inset ring-line focus-within:ring-2 focus-within:ring-reply-500">
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
        }}
        onKeyDown={(e) => {
          if (isSubmitEnter(e)) {
            e.preventDefault()
            void submit()
          }
        }}
        placeholder={placeholder}
        className="max-h-36 min-h-[34px] flex-1 resize-none bg-transparent py-[7px] text-[15px] leading-5 text-fg outline-none placeholder:text-fg-3"
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!text.trim() || sending}
        className="flex size-[34px] shrink-0 items-center justify-center rounded-xl bg-reply-500 text-white transition hover:bg-reply-600 disabled:bg-line-strong disabled:text-fg-3"
        aria-label="리플 보내기"
      >
        {sending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4 stroke-[2.6]" />}
      </button>
    </div>
  )
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-3 text-sm font-semibold text-fg-2 transition hover:border-fg-3 hover:bg-surface-2 hover:text-fg"
    >
      <Plus className="size-4" />
      {children}
    </button>
  )
}
