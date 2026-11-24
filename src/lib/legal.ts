/**
 * 개인정보처리방침·이용약관에 들어가는 운영 정보.
 * 운영자 이름과 문의 메일은 배포 환경 변수로 넣는다(Cloudflare Pages → 환경 변수, 텍스트).
 *   VITE_OPERATOR_NAME   예: 홍길동 / ○○교육원
 *   VITE_OPERATOR_EMAIL  예: privacy@example.com
 */
export const SERVICE_NAME = 'PingPongRally(핑퐁랠리)'
export const EFFECTIVE_DATE = '2026년 11월 24일'
export const OPERATOR_NAME = ((import.meta.env.VITE_OPERATOR_NAME as string | undefined) || '').trim() || 'PingPongRally 운영자'
export const OPERATOR_EMAIL = ((import.meta.env.VITE_OPERATOR_EMAIL as string | undefined) || '').trim()
/** 메일을 정하지 않았을 때의 문의 창구(공개 게시판이므로 개인정보는 적지 않도록 안내한다) */
export const ISSUE_URL = 'https://github.com/buddykorea79-cell/pingpongrally/issues'
