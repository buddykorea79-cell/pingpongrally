import { cn } from '@/lib/utils'

export const STORAGE_LOCATION = (import.meta.env.VITE_STORAGE_LOCATION as string | undefined) || 'Supabase(서울 리전)'

interface ConsentInfo {
  title: string
  controller_name: string
  contact: string
  phone_purpose: string
  collect_phone: boolean
}

function ConsentTable({ rows }: { rows: [string, string, string] }) {
  const labels = ['수집·이용 목적', '수집 항목', '보유·이용 기간']
  return (
    <dl className="my-3 divide-y divide-line overflow-hidden rounded-lg ring-1 ring-inset ring-line">
      {rows.map((v, i) => (
        <div key={labels[i]} className="flex gap-3 px-3.5 py-2.5 text-[13px]">
          <dt className="w-[88px] shrink-0 text-fg-3">{labels[i]}</dt>
          <dd className="min-w-0 flex-1 text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** 설계서 6.3 동의 문안. 중괄호 값은 강의 설정으로 채운다. */
export function RequiredConsentText({ info, className }: { info: ConsentInfo; className?: string }) {
  const controller = info.controller_name || '강사'
  return (
    <div className={cn('text-[13.5px] leading-relaxed text-fg-2', className)}>
      <p className="text-fg">[필수] 개인정보 수집·이용 동의</p>
      <p className="mt-2">
        {controller}은(는) 「{info.title}」 참석 확인을 위해 아래와 같이 개인정보를 수집·이용합니다.
      </p>
      <ConsentTable rows={['교육 참석 확인 및 출석 관리', '소속 기관, 부서, 성명', '교육 종료 후 7일(이후 자동 파기)']} />
      <p>귀하는 동의를 거부할 권리가 있습니다. 동의하지 않으면 등록되지 않아 출석이 확인되지 않으며, 강의 참여(닉네임으로 글쓰기)에는 제한이 없습니다.</p>
    </div>
  )
}

export function OptionalConsentText({ info, className }: { info: ConsentInfo; className?: string }) {
  return (
    <div className={cn('text-[13.5px] leading-relaxed text-fg-2', className)}>
      <p className="text-fg">[선택] 개인정보 수집·이용 동의</p>
      <ConsentTable rows={[info.phone_purpose || '교육 관련 연락', '휴대폰 번호', '교육 종료 후 7일(이후 자동 파기)']} />
      <p>동의하지 않아도 교육 참여에는 제한이 없습니다.</p>
    </div>
  )
}

export function ConsentNotices({ info, className }: { info: ConsentInfo; className?: string }) {
  return (
    <ul className={cn('space-y-1.5 text-[13px] leading-relaxed text-fg-2', className)}>
      {[
        '랠리 화면에는 닉네임만 표시되며, 성명·소속·휴대폰 번호는 다른 참석자에게 보이지 않습니다.',
        `수집한 정보는 ${STORAGE_LOCATION} 서버에 저장되고 강사만 열람합니다.`,
        '등록 링크를 다시 열거나 랠리 화면의 [내 정보]에서 등록 정보를 확인·수정·삭제(동의 철회)할 수 있습니다.',
        '이 강의의 글·첨부파일은 강의 시작 72시간 후 자동 삭제됩니다. 개인정보·내부 자료는 게시하지 마세요.',
        `문의: ${info.contact || '강사에게 문의해 주세요'}`,
      ].map((t) => (
        <li key={t} className="flex gap-2">
          <span className="mt-[9px] h-px w-2 shrink-0 bg-fg-3" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}
