import { backend } from './backend'
import type { PingSet, PingSetItem, RallyNode } from './types'

/**
 * 핑 템플릿: 다시 쓰고 싶은 핑·퀵폴을 모아 두는 곳.
 * 저장소는 기존 ping_sets(묶음) 그대로 쓰고, 화면에서는 '템플릿 묶음'으로만 보여 준다.
 * 하나씩 저장하면 '내 템플릿' 묶음에 쌓이고, 강의 전체를 저장하면 강의 제목으로 묶음이 생긴다.
 */
export const MY_TEMPLATES = '내 템플릿'

/** 강의가 끝나면 올린 파일은 지워지므로 링크 첨부만 템플릿에 남긴다. */
export function templateFromNode(n: Pick<RallyNode, 'type' | 'content' | 'attachments' | 'meta'>): PingSetItem {
  const poll = n.type === 'poll'
  return {
    type: poll ? 'poll' : 'ping',
    content: n.content,
    attachments: n.attachments.filter((a) => a.kind === 'link'),
    meta: poll
      ? {
          options: (n.meta.options ?? []).map((o) => ({ ...o })),
          multiple: Boolean(n.meta.multiple),
          show_results: n.meta.show_results === 'live' ? 'live' : 'after_close',
        }
      : undefined,
  }
}

const sameItem = (a: PingSetItem, b: PingSetItem) =>
  a.type === b.type &&
  a.content.trim() === b.content.trim() &&
  (a.meta?.options ?? []).map((o) => o.label).join('|') === (b.meta?.options ?? []).map((o) => o.label).join('|')

/** '내 템플릿' 묶음에 하나 더한다. 같은 내용이 이미 있으면 그대로 둔다. */
export async function addToMyTemplates(item: PingSetItem): Promise<{ set: PingSet; duplicate: boolean }> {
  const sets = await backend.listPingSets()
  const mine = sets.find((s) => s.title === MY_TEMPLATES)
  if (mine?.pings.some((p) => sameItem(p, item))) return { set: mine, duplicate: true }
  const set = await backend.savePingSet({ id: mine?.id, title: MY_TEMPLATES, pings: [...(mine?.pings ?? []), item] })
  return { set, duplicate: false }
}

/** 템플릿 묶음 목록: '내 템플릿'을 맨 앞에 */
export async function listTemplateGroups(): Promise<PingSet[]> {
  const sets = await backend.listPingSets()
  return sets.slice().sort((a, b) => Number(b.title === MY_TEMPLATES) - Number(a.title === MY_TEMPLATES))
}
