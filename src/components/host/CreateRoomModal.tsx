import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { backend } from '@/lib/backend'
import type { SurveyTiming } from '@/lib/types'
import { errorMessage } from '@/lib/errors'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import { Modal } from '../ui/Overlay'
import { useToast } from '../ui/Feedback'

export const TIMING_LABEL: Record<SurveyTiming, string> = { pre: '사전', live: '중간', post: '사후' }

/**
 * 새 강의: 제목만 있으면 만들어진다.
 * 핑(템플릿에서 불러오기 포함)·설문·참석자 등록은 만든 뒤 [진행]·[관리]에서 준비한다.
 */
export function CreateRoomModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open) return
    setTitle('')
    setTouched(false)
  }, [open])

  async function create(e?: React.FormEvent) {
    e?.preventDefault()
    setTouched(true)
    if (!title.trim()) return
    setSaving(true)
    try {
      const room = await backend.createRoom({ title })
      toast.show('강의를 만들었어요.')
      onClose()
      nav(`/host/rooms/${room.id}`)
    } catch (err) {
      toast.show(errorMessage(err), 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="새 강의"
      description="준비 상태로 만들어져요. 강의 당일 [강의 시작]을 누르면 입장 코드와 QR이 열려요."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button loading={saving} onClick={() => void create()}>
            만들기
          </Button>
        </>
      }
    >
      <form onSubmit={create}>
        <Field label="강의 제목" error={touched && !title.trim() ? '제목을 입력해 주세요.' : null}>
          <Input data-autofocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="예: 생성형 AI로 일하는 법" inputSize="lg" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
