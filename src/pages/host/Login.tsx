import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { backend, isDemo } from '@/lib/backend'
import { errorMessage } from '@/lib/errors'
import { useDocumentTitle } from '@/lib/hooks'
import { Logo } from '@/components/ui/Display'

/**
 * 강사 로그인 = 가입. Google 계정 하나로 들어온다(비밀번호 없음).
 * 계정이 있어야 '1명당 열린 강의 1개' 규칙을 지킬 수 있고, 강사만 보는 등록 정보도 보호된다.
 */
export default function HostLogin() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const nextRaw = params.get('next') || '/host'
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/host'
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'google' | 'demo' | null>(null)
  useDocumentTitle('강사 로그인')

  useEffect(() => {
    const go = (s: { isAnonymous: boolean } | null) => s && !s.isAnonymous && nav(next, { replace: true })
    backend.getSession().then(go)
    return backend.onAuthChange(go)
  }, [nav, next])

  async function google() {
    setBusy('google')
    setError(null)
    try {
      await backend.signInWithGoogle(`/host/login?next=${encodeURIComponent(next)}`)
      // 운영: Google 화면으로 이동한다. 데모: 곧바로 세션이 생겨 위 effect 가 이동시킨다.
    } catch (e) {
      setError(errorMessage(e))
      setBusy(null)
    }
  }

  async function demoLogin() {
    setBusy('demo')
    setError(null)
    try {
      const { signInDemoHost } = await import('@/lib/backend/demo')
      await signInDemoHost()
      nav(next, { replace: true })
    } catch (e) {
      setError(errorMessage(e))
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" aria-label="처음으로">
          <Logo size="sm" />
        </Link>
        <Link to="/" className="flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg">
          <ArrowLeft className="size-3.5 stroke-[1.6]" /> 교육생 입장
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-[360px] animate-fade-up">
          <p className="eyebrow">강사</p>
          <h1 className="mt-3 text-[28px] font-extralight leading-snug tracking-[-0.03em]">강의를 열려면 로그인하세요</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-fg-2">Google 계정으로 들어와요. 처음이면 자동으로 가입되고, 비밀번호는 없어요.</p>

          <button
            onClick={() => void google()}
            disabled={!!busy}
            className="relative mt-8 flex h-12 w-full items-center justify-center rounded-xl bg-surface text-[15px] text-fg ring-1 ring-inset ring-line-strong transition hover:bg-surface-2 disabled:opacity-60"
          >
            <GoogleIcon className="absolute left-4 size-[18px]" />
            {busy === 'google' ? '연결하는 중…' : 'Google로 계속하기'}
          </button>

          {error && (
            <p className="mt-4 text-[13px] leading-relaxed text-danger" role="alert">
              {error}
            </p>
          )}

          <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">
            계속하면{' '}
            <Link to="/terms" className="text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg">
              이용약관
            </Link>
            과{' '}
            <Link to="/privacy" className="text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg">
              개인정보 처리방침
            </Link>
            에 동의하는 것으로 봐요.
          </p>

          <p className="mt-10 border-t border-line pt-4 text-[12.5px] leading-relaxed text-fg-3">
            강사 1명은 강의를 한 번에 1개만 열 수 있어요. 교육생은 로그인 없이 입장 코드로 들어와요.
          </p>
          {isDemo && (
            <button onClick={() => void demoLogin()} disabled={!!busy} className="mt-3 flex w-full items-center justify-between text-left text-[13px] text-fg-2 hover:text-fg">
              <span>{busy === 'demo' ? '들어가는 중…' : '데모 강사 계정으로 둘러보기'}</span>
              <ArrowRight className="size-3.5 stroke-[1.6]" />
            </button>
          )}
          {isDemo && <p className="mt-1.5 text-[12px] text-fg-3">데모 모드에서는 [Google로 계속하기]를 누르면 빈 새 계정으로 들어가요.</p>}
        </div>
      </main>
    </div>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M23.06 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.38Z" />
      <path fill="#34A853" d="M12 23.5c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.02-6.45-4.74H1.7v2.98A11.5 11.5 0 0 0 12 23.5Z" />
      <path fill="#FBBC05" d="M5.55 14.18a6.9 6.9 0 0 1 0-4.36V6.84H1.7a11.5 11.5 0 0 0 0 10.32l3.85-2.98Z" />
      <path fill="#EA4335" d="M12 5.08c1.69 0 3.21.58 4.4 1.72l3.3-3.3A11.1 11.1 0 0 0 12 .5 11.5 11.5 0 0 0 1.7 6.84l3.85 2.98C6.46 7.1 9 5.08 12 5.08Z" />
    </svg>
  )
}
