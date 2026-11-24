const COLORS = ['초록', '파란', '노란', '빨간', '보라', '하얀', '주황', '분홍', '회색', '연두', '하늘', '은빛', '금빛', '민트', '남색', '갈색']
const ANIMALS = [
  '펭귄', '고래', '여우', '문어', '북극곰', '고양이', '돌고래', '늑대', '개구리', '다람쥐', '수달', '표범',
  '토끼', '부엉이', '판다', '해달', '거북이', '고슴도치', '너구리', '사슴', '코알라', '앵무새', '미어캣', '참새',
]

export function randomNickname(exclude: Iterable<string> = []): string {
  const taken = new Set(exclude)
  for (let i = 0; i < 40; i++) {
    const n = COLORS[Math.floor(Math.random() * COLORS.length)] + ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
    if (!taken.has(n)) return n
  }
  return `${COLORS[0]}${ANIMALS[0]}${Math.floor(Math.random() * 90 + 10)}`
}

/** 서로 겹치지 않는 닉네임 n개 */
export function randomNicknames(n: number, exclude: Iterable<string> = []): string[] {
  const taken = new Set(exclude)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const nick = randomNickname(taken)
    taken.add(nick)
    out.push(nick)
  }
  return out
}

export const MEMBER_COLORS = [
  '#FF6A3D', '#5A68F8', '#15B596', '#9157FB', '#F2A516', '#E5484D',
  '#0EA5E9', '#D946EF', '#22A06B', '#F97316', '#6366F1', '#14B8A6',
]

export function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return MEMBER_COLORS[h % MEMBER_COLORS.length]
}

export function validateNickname(n: string): string | null {
  const t = n.trim()
  if (t.length < 2) return '닉네임은 2자 이상이어야 해요.'
  if (t.length > 12) return '닉네임은 12자까지 쓸 수 있어요.'
  if (t === '강사') return '‘강사’는 쓸 수 없는 닉네임이에요.'
  if (/[<>]/.test(t)) return '닉네임에 < > 기호는 쓸 수 없어요.'
  return null
}
