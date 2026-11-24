import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, Moon, Sun } from 'lucide-react'
import { Button, ButtonLink } from '@/components/ui/Button'
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

const HOST_STEPS = ['Google 계정으로 로그인해요(처음이면 자동 가입)', '강의를 만들고 [강의 시작]을 누르면 입장 코드·QR이 생겨요']
const GUEST_STEPS = ['화면의 QR을 찍거나 입장 코드 숫자 6자리를 넣어요', '닉네임을 정하고 핑에 퐁을 보내요']

/** 오른쪽 상자 안의 번호 목록 */
function Steps({ items }: { items: string[] }) {
  return (
    <ol className="mt-5 space-y-3">
      {items.map((s, i) => (
        <li key={s} className="flex items-baseline gap-3 text-[16px] leading-relaxed text-fg-2 sm:text-[16.5px]">
          <span className="tabular flex size-6 shrink-0 translate-y-[-1px] items-center justify-center rounded-full font-mono text-[12px] text-fg-3 ring-1 ring-line-strong">{i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  )
}

const BOX = 'rounded-2xl bg-[#f5f6fc]/85 p-6 ring-1 ring-[#e8eaf5] backdrop-blur-2xl sm:p-8 dark:bg-surface/70 dark:ring-line'

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
        <Link to="/" aria-label="PingPongRally 처음 화면">
          <Logo size="xl" />
        </Link>
        <button onClick={toggleTheme} className="rounded-lg p-2 text-fg-3 transition hover:text-fg" aria-label="화면 테마 바꾸기">
          <Sun className="hidden size-[18px] stroke-[1.5] dark:block" />
          <Moon className="size-[18px] stroke-[1.5] dark:hidden" />
        </button>
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

        {/* 오른쪽: 강사(위) / 참여자(아래) 상자. 휴대폰에서는 이쪽이 먼저 보인다 */}
        <section className="order-first animate-fade-up space-y-4 lg:order-none">
          <div className={BOX}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[22px] font-light tracking-[-0.02em] text-fg">강사</h2>
              <span className="text-[13px] text-fg-3">Google 로그인</span>
            </div>
            <Steps items={HOST_STEPS} />
            <ButtonLink to="/host" variant="secondary" size="xl" block className="mt-6" iconRight={<ArrowRight className="size-4 stroke-[1.6]" />}>
              시작하기
            </ButtonLink>
          </div>

          <div className={BOX}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[22px] font-light tracking-[-0.02em] text-fg">참여자</h2>
              <span className="text-[13px] text-fg-3">로그인 없이 바로</span>
            </div>
            <Steps items={GUEST_STEPS} />

            <form
              className="mt-7 space-y-3 border-t border-line pt-6"
              onSubmit={(e) => {
                e.preventDefault()
                go()
              }}
            >
              <p className="text-[14px] text-fg-2">입장 코드</p>
              <CodeInput value={code} onChange={setCode} onComplete={(c) => go(c)} />
              <Button type="submit" size="xl" block disabled={code.length !== 6} iconRight={<ArrowRight className="size-4 stroke-[1.6]" />}>
                입장하기
              </Button>
            </form>
            <p className="mt-3 text-[13.5px] text-fg-3">휴대폰 카메라로 QR을 비추면 코드 없이 바로 열려요.</p>

            {isDemo && (
              <button onClick={() => go('777777')} className="mt-6 flex w-full items-center justify-between border-t border-line pt-4 text-left text-[13.5px] text-fg-3 transition hover:text-fg">
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
        <span className="flex gap-4">
          <Link to="/terms" className="hover:text-fg-2">
            이용약관
          </Link>
          <Link to="/privacy" className="hover:text-fg-2">
            개인정보 처리방침
          </Link>
        </span>
      </footer>
    </div>
  )
}
