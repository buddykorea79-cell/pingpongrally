import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/** 척도 문항 분포(Recharts). 결과 화면에서만 불러온다. */
export default function ScaleChart({
  data,
  dark,
  height = 170,
  labels,
}: {
  data: { label: string; count: number }[]
  dark?: boolean
  height?: number
  labels?: [string | undefined, string | undefined]
}) {
  const max = Math.max(1, ...data.map((d) => d.count))
  const tick = dark ? 'rgba(255,255,255,0.6)' : 'var(--fg-3)'
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: tick, fontSize: height > 200 ? 18 : 12, fontWeight: 600 }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: tick, fontSize: 11 }} width={44} />
          <Tooltip
            cursor={{ fill: dark ? 'rgba(255,255,255,0.05)' : 'var(--surface-3)' }}
            contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 24px -8px rgba(0,0,0,.25)', background: dark ? '#1c2029' : 'var(--surface)', color: dark ? '#fff' : 'var(--fg)' }}
            formatter={(v) => [`${v}명`, '응답']}
            labelFormatter={(l) => `${l}점`}
          />
          <Bar dataKey="count" radius={[10, 10, 4, 4]} maxBarSize={56} isAnimationActive>
            {data.map((d, i) => (
              <Cell key={i} fill={d.count === max && d.count > 0 ? 'var(--color-pong-500)' : dark ? 'rgba(255,255,255,0.18)' : 'var(--color-pong-200)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {(labels?.[0] || labels?.[1]) && (
        <div className={`mt-1 flex justify-between px-5 text-xs font-medium ${dark ? 'text-white/50' : 'text-fg-3'}`}>
          <span>{labels?.[0]}</span>
          <span>{labels?.[1]}</span>
        </div>
      )}
    </div>
  )
}
