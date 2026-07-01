// ── Bar Chart ─────────────────────────────────────────────────────────────────

interface BarSeries {
  key: string
  label: string
  color: string
}

interface BarChartProps {
  data: Record<string, any>[]
  xKey: string
  series: BarSeries[]
  height?: number
}

export function BarChart({ data, xKey, series, height = 220 }: BarChartProps) {
  if (!data.length) return <EmptyChart />

  const maxVal = Math.max(
    1,
    ...data.flatMap(d => series.map(s => Number(d[s.key] ?? 0))),
  )
  const padL = 40
  const padB = 40
  const padT = 16
  const padR = 12
  const W = 600
  const H = height
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const groupW = chartW / data.length
  const barW = Math.min((groupW / series.length) - 2, 28)

  const yTicks = 5
  const yStep = maxVal / yTicks

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: height }}>
      {/* Y grid */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const y = padT + chartH - (i * chartH) / yTicks
        const val = Math.round(i * yStep)
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{val}</text>
          </g>
        )
      })}

      {/* Bars */}
      {data.map((d, gi) => {
        const groupX = padL + gi * groupW + groupW / 2 - (series.length * (barW + 2)) / 2
        return (
          <g key={gi}>
            {series.map((s, si) => {
              const val = Number(d[s.key] ?? 0)
              const bh = Math.max(0, (val / maxVal) * chartH)
              const bx = groupX + si * (barW + 2)
              const by = padT + chartH - bh
              return (
                <g key={s.key}>
                  <rect x={bx} y={by} width={barW} height={bh} fill={s.color} rx="2" />
                  {val > 0 && bh > 14 && (
                    <text x={bx + barW / 2} y={by + 10} textAnchor="middle" fontSize="8" fill="white" fontWeight="600">{val}</text>
                  )}
                </g>
              )
            })}
            {/* X label */}
            <text
              x={padL + gi * groupW + groupW / 2}
              y={H - padB + 14}
              textAnchor="middle"
              fontSize="9"
              fill="#6b7280"
            >
              {String(d[xKey] ?? '').slice(5)} {/* e.g. 2026-03 → 03 */}
            </text>
          </g>
        )
      })}

      {/* Axes */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#d1d5db" />
      <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#d1d5db" />
    </svg>
  )
}

// ── Burndown Chart ────────────────────────────────────────────────────────────

interface BurndownChartProps {
  data: { period: string; remaining: number }[]
  height?: number
}

export function BurndownChart({ data, height = 180 }: BurndownChartProps) {
  if (!data.length) return <EmptyChart />

  const maxVal = Math.max(1, ...data.map(d => d.remaining))
  const padL = 40
  const padB = 32
  const padT = 12
  const padR = 12
  const W = 600
  const H = height
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const n = data.length

  const px = (i: number) => padL + (i / (n - 1)) * chartW
  const py = (v: number) => padT + chartH - (v / maxVal) * chartH

  const points = data.map((d, i) => `${px(i)},${py(d.remaining)}`).join(' ')
  const area = `M${padL},${padT + chartH} ${data.map((d, i) => `L${px(i)},${py(d.remaining)}`).join(' ')} L${px(n - 1)},${padT + chartH} Z`

  const yTicks = 4
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: height }}>
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const y = padT + chartH - (i * chartH) / yTicks
        const val = Math.round(i * maxVal / yTicks)
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={padL - 4} y={y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{val}</text>
          </g>
        )
      })}

      {/* Area */}
      <path d={area} fill="#dbeafe" opacity="0.6" />
      {/* Line */}
      <polyline points={points} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />
      {/* Points */}
      {data.map((d, i) => (
        <circle key={i} cx={px(i)} cy={py(d.remaining)} r="3" fill="#2563eb" />
      ))}

      {/* X labels */}
      {data.filter((_, i) => n <= 12 || i % Math.ceil(n / 12) === 0).map((d, i) => {
        const origIdx = data.indexOf(d)
        return (
          <text key={i} x={px(origIdx)} y={H - padB + 14} textAnchor="middle" fontSize="9" fill="#6b7280">
            {String(d.period).slice(5)}
          </text>
        )
      })}

      <line x1={padL} y1={padT} x2={padL} y2={padT + chartH} stroke="#d1d5db" />
      <line x1={padL} y1={padT + chartH} x2={W - padR} y2={padT + chartH} stroke="#d1d5db" />
    </svg>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

export function ChartLegend({ series }: { series: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 justify-center mb-2">
      {series.map(s => (
        <div key={s.label} className="flex items-center gap-1.5 text-xs text-gray-600">
          <div className="w-3 h-3 rounded" style={{ background: s.color }} />
          <span>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-32 text-sm text-gray-400">
      Нет данных за выбранный период
    </div>
  )
}
