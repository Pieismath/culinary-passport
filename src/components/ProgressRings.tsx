import { useApp } from '../store/store'
import { PURPLE } from '../config'

/** Two concentric rings: outer = tried by either, inner = tried together. */
export function ProgressRings() {
  const { progress, snap } = useApp()
  const { total, either, both } = progress
  const size = 40
  const c = size / 2

  const ring = (r: number, frac: number, stroke: string, track: string) => {
    const len = 2 * Math.PI * r
    return (
      <>
        <circle cx={c} cy={c} r={r} fill="none" stroke={track} strokeWidth={3} />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.001, frac) * len} ${len}`}
          transform={`rotate(-90 ${c} ${c})`}
          style={{ transition: 'stroke-dasharray 700ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </>
    )
  }

  const [u1, u2] = snap.users
  return (
    <div className="flex items-center gap-2.5" title={`${either} of ${total} cuisines · ${both} together`}>
      <svg width={size} height={size} className="shrink-0">
        <defs>
          <linearGradient id="ring-either" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={u1?.color ?? '#3b82e0'} />
            <stop offset="100%" stopColor={u2?.color ?? '#2fbf8a'} />
          </linearGradient>
        </defs>
        {ring(17, total ? either / total : 0, 'url(#ring-either)', 'rgba(42,39,35,0.1)')}
        {ring(11, total ? both / total : 0, PURPLE, 'rgba(42,39,35,0.07)')}
      </svg>
      <div className="leading-tight">
        <div className="text-[13px] font-semibold tabular-nums">
          {either} <span className="text-muted font-normal">/ {total}</span>
        </div>
        <div className="text-[11px] tabular-nums" style={{ color: PURPLE }}>
          {both} together
        </div>
      </div>
    </div>
  )
}
