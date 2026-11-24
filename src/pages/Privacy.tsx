import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { Logo } from '@/components/ui/Display'
import { STORAGE_LOCATION } from '@/components/rally/Consent'
import { useDocumentTitle } from '@/lib/hooks'

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: '수집하는 항목',
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>모든 참여자: 닉네임, 작성한 글·첨부파일, 퀵폴 투표, 설문 응답</li>
        <li>참석자 등록(강사가 보낸 등록 링크에서 직접 입력): 소속 기관, 부서, 성명(필수 동의), 휴대폰 번호(선택 동의, 강사가 켠 경우만)</li>
        <li>로그인 정보: 교육생은 화면 없이 만들어지는 익명 계정, 강사는 Google 계정으로 만든 계정(이메일 주소)</li>
      </ul>
    ),
  },
  {
    title: '이용 목적',
    body: '강의 중 질문·답변 진행, 교육 참석 확인과 출석 관리, 강사가 정한 교육 관련 연락(휴대폰 번호를 받은 경우), 교육 효과 분석(실명 연결 설문을 쓴 경우).',
  },
  {
    title: '보유 기간과 파기',
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>강의는 시작 후 24시간 동안 열립니다(강사가 연장하거나 일찍 종료할 수 있음).</li>
        <li>글·첨부파일·투표: 강의 시작 72시간 뒤 자동 삭제</li>
        <li>참석자 등록 정보·사전 명단·설문 응답: 교육 종료 7일 뒤 자동 파기(강의를 시작하지 않으면 등록 폼을 연 지 30일 뒤)</li>
        <li>교육생이 [내 정보]에서 삭제하면 즉시 지웁니다. 강사는 [지금 파기]로 앞당길 수 있습니다.</li>
      </ul>
    ),
  },
  {
    title: '보관 위치와 열람',
    body: `${STORAGE_LOCATION} 서버에 저장되며, 등록 정보는 본인과 그 강의의 강사만 열람할 수 있습니다. 랠리 화면에는 닉네임만 표시됩니다.`,
  },
  {
    title: '거부할 권리',
    body: '개인정보 수집·이용 동의를 거부할 수 있습니다. 동의하지 않으면 등록되지 않아 출석이 확인되지 않지만, 강의 참여(닉네임으로 글쓰기)에는 제한이 없습니다. 등록 링크나 [내 정보]에서 언제든 등록을 삭제(동의 철회)할 수 있습니다.',
  },
  {
    title: '이용자 주의 사항',
    body: '글과 파일에는 개인정보(실명·연락처 등)나 기관 내부 자료를 올리지 마세요. 강사는 부적절한 글을 숨길 수 있습니다.',
  },
  {
    title: '문의',
    body: '각 강의의 동의 문안에 적힌 개인정보처리자와 문의처로 연락해 주세요.',
  },
]

export default function Privacy() {
  useDocumentTitle('개인정보 처리 안내')
  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-2xl px-5 py-8">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-2 hover:text-fg">
            <ArrowLeft className="size-4" /> 처음으로
          </Link>
          <Logo size="sm" />
        </div>
        <h1 className="mt-10 text-[30px] font-extrabold tracking-tight">개인정보 처리 안내</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-2">
          PingPongRally는 필요한 최소한의 정보만 받고, 정해진 기간이 지나면 자동으로 지웁니다.
        </p>
        <div className="mt-8 space-y-3">
          {SECTIONS.map((s, i) => (
            <section key={s.title} className="rounded-3xl bg-surface p-6 ring-1 ring-line">
              <h2 className="flex items-center gap-2.5 text-[16px] font-bold">
                <span className="flex size-6 items-center justify-center rounded-lg bg-surface-3 font-mono text-xs text-fg-2">{i + 1}</span>
                {s.title}
              </h2>
              <div className="mt-3 text-[14.5px] leading-relaxed text-fg-2">{s.body}</div>
            </section>
          ))}
        </div>
        <p className="mt-8 text-[13px] leading-relaxed text-fg-3">
          이 안내는 서비스 운영 방식에 대한 설명이며, 공식 교육에서 쓰기 전 주관 기관 개인정보 담당 부서의 검토를 받아야 합니다.
        </p>
      </div>
    </div>
  )
}
