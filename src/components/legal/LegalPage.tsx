import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '@/components/ui/Display'
import { useDocumentTitle } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { EFFECTIVE_DATE, ISSUE_URL, OPERATOR_EMAIL } from '@/lib/legal'

export interface LegalSection {
  id: string
  title: string
  body: ReactNode
}

/** 개인정보처리방침·이용약관 공통 틀: 제목, 시행일, 목차, 조항 */
export function LegalPage({ title, intro, sections, other }: { title: string; intro: ReactNode; sections: LegalSection[]; other: { to: string; label: string } }) {
  useDocumentTitle(title)
  return (
    <div className="min-h-dvh bg-white dark:bg-bg">
      <div className="mx-auto max-w-[760px] px-5 pb-20 pt-6 sm:px-8">
        <header className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-fg">
            <ArrowLeft className="size-3.5 stroke-[1.6]" /> 처음으로
          </Link>
          <Link to="/" aria-label="PingPongRally 처음 화면">
            <Logo size="sm" />
          </Link>
        </header>

        <h1 className="mt-12 text-[32px] font-extralight tracking-[-0.03em] text-fg">{title}</h1>
        <p className="mt-2 text-[13px] text-fg-3">시행일 {EFFECTIVE_DATE}</p>
        <div className="mt-6 text-[15px] leading-[1.8] text-fg-2">{intro}</div>

        <nav aria-label="목차" className="mt-8 rounded-xl bg-[#f5f6fc] p-5 ring-1 ring-[#e8eaf5] dark:bg-surface dark:ring-line">
          <p className="eyebrow mb-3">목차</p>
          <ol className="grid gap-x-6 gap-y-1.5 text-[13.5px] sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-fg-2 hover:text-fg hover:underline hover:underline-offset-4">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-6">
              <h2 className="text-[18px] font-normal tracking-tight text-fg">
                <span className="mr-2 font-mono text-[13px] text-fg-3">{String(i + 1).padStart(2, '0')}</span>
                {s.title}
              </h2>
              <div className="legal-body mt-3 space-y-3 text-[14.5px] leading-[1.8] text-fg-2">{s.body}</div>
            </section>
          ))}
        </div>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[13px] text-fg-3">
          <span>PingPongRally · 시행일 {EFFECTIVE_DATE}</span>
          <Link to={other.to} className="text-fg-2 hover:text-fg">
            {other.label} →
          </Link>
        </footer>
      </div>
    </div>
  )
}

/** 표: 머리 줄 + 행 */
export function LegalTable({ head, rows, className }: { head: string[]; rows: ReactNode[][]; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-xl ring-1 ring-line', className)}>
      <table className="w-full min-w-[520px] text-left text-[13.5px] leading-relaxed">
        <thead className="bg-surface-2 text-fg">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td key={j} className={cn('px-4 py-3', j === 0 ? 'text-fg' : 'text-fg-2')}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 운영자 문의 창구: 메일이 정해져 있으면 메일, 아니면 공개 이슈 게시판 */
export function OperatorContact() {
  if (OPERATOR_EMAIL) {
    return (
      <a href={`mailto:${OPERATOR_EMAIL}`} className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg">
        {OPERATOR_EMAIL}
      </a>
    )
  }
  return (
    <>
      <a href={ISSUE_URL} target="_blank" rel="noreferrer" className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg">
        GitHub 문의 게시판
      </a>{' '}
      (공개 게시판이므로 이름·연락처 같은 개인정보는 적지 마세요)
    </>
  )
}
