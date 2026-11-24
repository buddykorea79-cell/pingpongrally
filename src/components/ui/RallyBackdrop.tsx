/**
 * 처음 화면 배경: 파스텔 공 두 개가 포물선을 그리며 천천히 오가는 '랠리'.
 * 가로는 일정한 속도, 세로는 2차 곡선(올라갈 때 감속·내려올 때 가속)이라 실제 포물선이 된다.
 * 크기는 따로 천천히 커졌다 작아져 멀어지고 다가오는 느낌을 준다.
 * 움직임 줄이기 설정이면 멈춘 채로 둔다(index.css).
 */
export function RallyBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {(['a', 'b'] as const).map((k) => (
        <div key={k} className={`rally-ball rally-ball--${k}`}>
          <div className="rally-x">
            <div className="rally-y">
              <div className="rally-s" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
