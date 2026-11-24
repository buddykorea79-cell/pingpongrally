import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Display'
import { RallyBackdrop } from '@/components/ui/RallyBackdrop'
import { CodeInput } from '@/components/rally/CodeInput'
import { isDemo } from '@/lib/backend'
import { toggleTheme, useDocumentTitle } from '@/lib/hooks'

const FEATURES = [
  { name: '핑', tone: 'bg-ping-500', text: '강사가 던지는 질문이에요. 강사가 화면에 띄우면 모두의 휴대폰에 바로 떠요.' },
  { name: '퐁', tone: 'bg-pong-500', text: '교육생의 답이에요. 글·사진·파일·링크로 보내고, 서로의 퐁에 리플을 달아요.' },
  { name: '퀵폴', tone: 'bg-poll-500', text: '즉석 투표예요. 결과가 막대그래프로 바로 보여요.' },
]

const STEPS = ['화면의 QR을 찍거나 입장 코드 숫자 6자리를 넣어요', '닉네임을 정하고 들어가요', '핑에 퐁을 보내고, 리플과 투표로 함께해요']

/** 처음 화면: 왼쪽은 서비스 안내, 오른쪽은 참여 방법과 입장. 휴대폰에서는 입장이 먼저 보인다. */
export default function Home() {
  const nav = useNavigate()
  const [code, setCode] = useState('')
  useDocumentTitle(null)
  const go = (c = code) => c.length === 6 && nav(`/j/${c}`)

  return (
    <div className="relative flex min-h-dvh flex-col bg-white dark:bg-bg">
      <RallyBackdrop />
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo size="sm" />
        <div className="flex items-center gap-1">
          <button onClick={toggleTheme} className="rounded-lg p-2 text-fg-3 transition hover:text-fg" aria-label="화면 테마 바꾸기">
            <Sun className="hidden size-[17px] stroke-[1.5] dark:block" />
            <Moon className="size-[17px] stroke-[1.5] dark:hidden" />
          </button>
          <Link to="/host" className="rounded-lg px-3 py-2 text-[13px] text-fg-2 transition hover:text-fg">
            강사로 시작하기
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-5 pb-16 pt-4 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-20 lg:pt-0">
        {/* 왼쪽: 안내 */}
        <section className="animate-fade-up lg:py-10">
          <p className="eyebrow">강의용 질문·답 보드</p>
          <h1 className="mt-4 text-[38px] font-extralight leading-[1.15] tracking-[-0.045em] text-fg sm:text-[52px]">
            질문은 <span className="text-ping-500">핑</span>,
            <br />
            답은 <span className="text-pong-500">퐁</span>.
          </h1>
          <p className="mt-6 max-w-[520px] text-[18px] leading-[1.7] tracking-[-0.01em] text-fg-2 sm:text-[20px]">
            강사가 질문을 던지면 교육생이 휴대폰으로 답하고, 서로의 답에 리플을 달며 생각을 주고받아요. 설치도, 가입도 필요 없어요.
          </p>

          <dl className="mt-10 max-w-[480px] divide-y divide-line border-y border-line">
            {FEATURES.map((f) => (
              <div key={f.name} className="flex gap-5 py-4">
                <dt className="flex w-12 shrink-0 items-center gap-2 text-[14px] text-fg">
                  <span className={`size-1.5 rounded-full ${f.tone}`} />
                  {f.name}
                </dt>
                <dd className="text-[14px] leading-relaxed text-fg-2">{f.text}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 text-[13px] leading-relaxed text-fg-3">
            글과 파일은 강의 시작 72시간 뒤 자동으로 지워져요.{' '}
            <Link to="/host" className="text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg">
              강의를 열려면 Google로 로그인
            </Link>
            하세요.
          </p>
        </section>

        {/* 오른쪽: 참여 방법과 입장 */}
        <section className="order-first animate-fade-up lg:order-none">
          <div className="rounded-2xl bg-[#f5f6fc]/85 p-6 ring-1 ring-[#e8eaf5] backdrop-blur-2xl sm:p-8 dark:bg-surface/70 dark:ring-line">
            <p className="eyebrow">참여 방법</p>
            <ol className="mt-4 space-y-3">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-baseline gap-3 text-[14px] leading-relaxed text-fg-2">
                  <span className="tabular w-4 shrink-0 font-mono text-[12px] text-fg-3">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>

            <form
              className="mt-8 space-y-3 border-t border-line pt-7"
              onSubmit={(e) => {
                e.preventDefault()
                go()
              }}
            >
              <p className="text-[13px] text-fg-2">입장 코드</p>
              <CodeInput value={code} onChange={setCode} onComplete={(c) => go(c)} />
              <Button type="submit" size="xl" block disabled={code.length !== 6} iconRight={<ArrowRight className="size-4 stroke-[1.6]" />}>
                입장하기
              </Button>
            </form>
            <p className="mt-3 text-[12.5px] text-fg-3">휴대폰 카메라로 QR을 비추면 코드 없이 바로 열려요.</p>

            {isDemo && (
              <button onClick={() => go('777777')} className="mt-7 flex w-full items-center justify-between border-t border-line pt-4 text-left text-[13px] text-fg-3 transition hover:text-fg">
                <span>
                  데모 강의 <span className="font-mono text-fg-2">777777</span> 둘러보기
                </span>
                <ArrowRight className="size-3.5 stroke-[1.6]" />
              </button>
            )}
          </div>
        </section>
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 pb-6 text-xs text-fg-3 sm:px-8">
        <span>PingPongRally</span>
        <Link to="/privacy" className="hover:text-fg-2">
          개인정보 처리 안내
        </Link>
      </footer>
    </div>
  )
}
