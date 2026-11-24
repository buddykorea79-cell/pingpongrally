const MESSAGES: Record<string, string> = {
  room_not_found: '입장 코드를 찾을 수 없어요. 진행 중인 강의인지 확인해 주세요.',
  room_limit: '강의는 한 번에 1개만 열 수 있어요. 지금 강의를 종료하거나(준비 중이면 삭제) 새로 만들어 주세요.',
  rooms_one_open_per_host: '강의는 한 번에 1개만 열 수 있어요. 지금 강의를 종료하거나(준비 중이면 삭제) 새로 만들어 주세요.',
  room_daily_limit: '강의는 24시간에 3개까지 만들 수 있어요. 내일 다시 시도해 주세요.',
  quota_exceeded: '저장할 수 있는 개수(100개)를 넘었어요. 쓰지 않는 항목을 지워 주세요.',
  registration_not_found: '등록 링크를 찾을 수 없어요. 주소를 다시 확인해 주세요.',
  registration_closed: '참석자 등록이 마감되었어요.',
  registration_full: '등록 인원이 가득 찼어요. 강사에게 문의해 주세요.',
  controller_required: '등록 폼을 열려면 개인정보처리자(강사명 또는 기관명)를 입력해 주세요.',
  consent_required: '필수 항목에 동의해야 등록할 수 있어요.',
  missing_fields: '소속 기관, 부서, 성명을 모두 입력해 주세요.',
  nickname_taken: '이미 쓰고 있는 닉네임이에요. 다른 닉네임을 골라 주세요.',
  invalid_nickname: '닉네임은 2~12자로 정해 주세요.',
  ping_closed: '이 핑은 퐁이 마감되었어요.',
  ping_not_open: '아직 공개되지 않은 핑이에요.',
  room_closed: '강의가 종료되어 더 이상 글을 쓸 수 없어요.',
  not_live: '진행 중인 강의가 아니에요.',
  already_started: '이미 시작한 강의예요.',
  content_too_long: '글은 1,000자까지 쓸 수 있어요.',
  empty_content: '내용을 입력하거나 첨부를 추가해 주세요.',
  invalid_attachment: '첨부 형식이 올바르지 않아요. 링크는 http·https 주소만 쓸 수 있어요.',
  not_allowed: '이 작업을 할 권한이 없어요.',
  not_member: '먼저 강의에 입장해 주세요.',
  extension_limit: '더 이상 연장할 수 없어요. 강의는 시작 후 최대 48시간까지 열 수 있어요.',
  invalid_hours: '연장 시간은 1~24시간 사이로 정해 주세요.',
  results_hidden: '투표가 마감된 뒤에 결과를 볼 수 있어요.',
  invalid_reaction: '쓸 수 없는 반응이에요.',
  reaction_target_not_found: '반응할 수 없는 글이에요. 지워졌거나 숨겨졌을 수 있어요.',
  poll_needs_2_to_6_options: '선택지는 2~6개로 만들어 주세요.',
  invalid_focus: '이 강의의 핑만 포커스할 수 있어요.',
  too_many_attempts: '입장 코드를 여러 번 틀렸어요. 10분 뒤에 다시 시도해 주세요.',
  code_generation_failed: '입장 코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
  not_authenticated: '로그인이 필요해요.',
  'Signups not allowed': '새 강사 가입이 막혀 있어요. 관리자에게 문의해 주세요.',
  'Unsupported provider': 'Google 로그인이 아직 켜져 있지 않아요. 관리자에게 문의해 주세요.',
  'provider is not enabled': 'Google 로그인이 아직 켜져 있지 않아요. 관리자에게 문의해 주세요.',
  'Anonymous sign-ins are disabled': '익명 입장이 꺼져 있어요. 관리자에게 문의해 주세요.',
  'Request rate limit reached': '같은 네트워크에서 입장 요청이 몰렸어요. 잠시 후 다시 시도해 주세요.',
  'captcha verification process failed': '자동 입력 방지 확인에 실패했어요. 새로고침 후 다시 시도해 주세요.',
  'Failed to fetch': '네트워크 연결을 확인해 주세요.',
  'The object exceeded the maximum allowed size': '파일이 너무 커요. 10MB 이하만 올릴 수 있어요.',
  'mime type': '올릴 수 없는 파일 형식이에요.',
}

export class AppError extends Error {
  code: string
  constructor(code: string, message?: string) {
    super(message ?? MESSAGES[code] ?? code)
    this.code = code
  }
}

export function errorMessage(err: unknown): string {
  if (!err) return '알 수 없는 오류가 발생했어요.'
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err)
  if (MESSAGES[raw]) return MESSAGES[raw]
  for (const key of Object.keys(MESSAGES)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return MESSAGES[key]
  }
  if (err instanceof AppError) return err.message
  return raw || '알 수 없는 오류가 발생했어요.'
}

export function errorCode(err: unknown): string | null {
  if (err instanceof AppError) return err.code
  const raw = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : ''
  for (const key of Object.keys(MESSAGES)) {
    if (raw.includes(key)) return key
  }
  return null
}
