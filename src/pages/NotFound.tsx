import { Link } from 'react-router'
import { LogoMark } from '@/components/ui/Display'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <LogoMark className="size-14" />
      <p className="mt-6 font-mono text-sm font-bold text-ping-500">404 · OUT</p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">공이 테이블 밖으로 나갔어요</h1>
      <p className="mt-2 text-[15px] text-fg-2">찾는 페이지가 없어요. 주소를 다시 확인해 주세요.</p>
      <Link to="/" className="mt-7 rounded-2xl bg-inverse px-5 py-3 text-sm font-semibold text-on-inverse">
        처음 화면으로
      </Link>
    </div>
  )
}
