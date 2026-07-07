import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store/store'
import type { Entry, User } from '../types'
import { flagEmoji, formatDate, plural } from '../lib/format'
import { Stars } from './StarRating'

const PAD = 130 // px of track before the first tick / after the last
const DAY = 86_400_000

type Tick = {
  entry: Entry
  user: User | undefined
  countryName: string
  x: number
  lane: number // 0,1,2… — collision lanes; even = stem up, odd = stem down
}

/** The Journal: one horizontal timeline, every meal a tick that expands on hover. */
export function TimelineView() {
  const { snap, geo, usersById, setSelectedCode, setView, resolvePhoto } = useApp()
  const [hovered, setHovered] = useState<Tick | null>(null)

  const { ticks, width, months, years, spark } = useMemo(() => {
    const ordered = [...snap.entries].sort(
      (a, b) => a.dateTried.localeCompare(b.dateTried) || a.createdAt.localeCompare(b.createdAt),
    )
    if (ordered.length === 0)
      return {
        ticks: [] as Tick[],
        width: 0,
        months: [] as { x: number; label: string }[],
        years: [] as { x0: number; x1: number; label: string }[],
        spark: null as null | { path: string; top: number; height: number },
      }

    const ms = (e: Entry) => new Date(`${e.dateTried}T12:00:00`).getTime()
    const t0 = ms(ordered[0])
    const t1 = ms(ordered[ordered.length - 1])
    const span = Math.max(DAY, t1 - t0)
    const days = span / DAY
    const pxPerDay = Math.min(60, Math.max(7, 2600 / days))
    const width = Math.max(780, days * pxPerDay + PAD * 2)
    const usable = width - PAD * 2
    const xOf = (t: number) => PAD + ((t - t0) / span) * usable

    const ticks: Tick[] = ordered.map((e) => ({
      entry: e,
      user: usersById.get(e.userId),
      countryName: geo?.byCode.get(e.countryCode)?.properties.name ?? e.countryCode,
      x: xOf(ms(e)),
      lane: 0,
    }))

    // spread near-coincident ticks across lanes (alternating above/below the line)
    let recent: { x: number; lane: number }[] = []
    for (const tk of ticks) {
      recent = recent.filter((r) => tk.x - r.x < 64)
      const used = new Set(recent.filter((r) => tk.x - r.x < 36).map((r) => r.lane))
      tk.lane = [0, 1, 2, 3, 4, 5].find((l) => !used.has(l)) ?? 0
      recent.push({ x: tk.x, lane: tk.lane })
    }

    // month markers along the track (month only — years get their own sticky band)
    const months: { x: number; label: string }[] = []
    const d = new Date(t0)
    d.setDate(1)
    const fmt = new Intl.DateTimeFormat('en-GB', { month: 'short' })
    while (d.getTime() <= t1 + DAY) {
      const x = xOf(d.getTime())
      if (x > 48) months.push({ x, label: fmt.format(d) })
      d.setMonth(d.getMonth() + 1)
    }

    // year segments — each renders a sticky label pinned to the left scroll edge
    const years: { x0: number; x1: number; label: string }[] = []
    const y0 = new Date(t0).getFullYear()
    const y1 = new Date(t1).getFullYear()
    for (let y = y0; y <= y1; y++) {
      const start = Math.max(t0, new Date(y, 0, 1).getTime())
      const end = Math.min(t1, new Date(y + 1, 0, 1).getTime())
      years.push({ x0: xOf(start), x1: xOf(end), label: String(y) })
    }

    // sparkline: meals per month, an area path above the axis
    const sparkH = 26
    const counts = new Map<string, number>()
    for (const e of ordered) {
      const key = e.dateTried.slice(0, 7)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const maxC = Math.max(...counts.values())
    const pts: [number, number][] = []
    const m = new Date(t0)
    m.setDate(15) // sample each month at its midpoint
    m.setMonth(m.getMonth() - 1)
    const endMs = t1 + 32 * DAY
    while (m.getTime() <= endMs) {
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
      const c = counts.get(key) ?? 0
      pts.push([xOf(Math.min(Math.max(m.getTime(), t0), t1)), sparkH - (c / maxC) * (sparkH - 4)])
      m.setMonth(m.getMonth() + 1)
    }
    const path =
      `M ${pts[0][0]} ${sparkH} ` +
      pts.map(([x, py]) => `L ${x.toFixed(1)} ${py.toFixed(1)}`).join(' ') +
      ` L ${pts[pts.length - 1][0]} ${sparkH} Z`

    return { ticks, width, months, years, spark: { path, top: 64, height: sparkH } }
  }, [snap.entries, usersById, geo])

  const openCountry = (tk: Tick) => {
    setView('globe')
    setSelectedCode(tk.entry.countryCode)
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="sheet fixed inset-0 z-20 flex flex-col pt-20"
    >
      <div className="flex items-baseline gap-4 px-8 pb-2">
        <h2 className="font-display text-3xl italic">The Journal</h2>
        <span className="text-sm text-muted">
          {plural(ticks.length, 'meal')} · hover a tick, click to open
        </span>
      </div>

      {ticks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-display text-lg text-muted italic">No meals logged yet — the journal starts with dinner.</p>
        </div>
      ) : (
        <div
          className="flex-1 overflow-x-auto overflow-y-hidden"
          onWheel={(e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY
          }}
        >
          <div className="relative h-full" style={{ width }}>
            {/* baseline */}
            <div className="absolute top-1/2 right-10 left-10 h-px bg-[rgba(42,39,35,0.2)]" />

            {/* sticky year labels along the top edge */}
            {years.map((y) => (
              <div
                key={y.label}
                className="absolute top-2 h-9"
                style={{ left: y.x0, width: Math.max(y.x1 - y.x0, 90) }}
              >
                <div className="font-display sticky left-8 inline-block text-2xl text-[rgba(42,39,35,0.35)] italic">
                  {y.label}
                </div>
              </div>
            ))}

            {/* meal-frequency sparkline above the axis */}
            {spark && (
              <svg
                className="pointer-events-none absolute"
                style={{ top: spark.top, left: 0, width, height: spark.height }}
                viewBox={`0 0 ${width} ${spark.height}`}
                preserveAspectRatio="none"
                aria-hidden
              >
                <path d={spark.path} fill="rgba(201,138,46,0.12)" stroke="rgba(201,138,46,0.45)" strokeWidth="1" />
              </svg>
            )}

            {/* month gridlines + labels */}
            {months.map((m) => (
              <div key={`${m.label}-${m.x}`} className="absolute top-0 bottom-0" style={{ left: m.x }}>
                <div className="absolute top-[16%] bottom-[16%] w-px bg-[rgba(42,39,35,0.06)]" />
                <div className="font-display absolute bottom-8 -translate-x-1/2 text-xs whitespace-nowrap text-muted italic">
                  {m.label}
                </div>
              </div>
            ))}

            {/* ticks */}
            {ticks.map((tk) => {
              const up = tk.lane % 2 === 0
              const stem = 30 + Math.floor(tk.lane / 2) * 26
              const color = tk.user?.color ?? '#c98a2e'
              const active = hovered?.entry.id === tk.entry.id
              return (
                <div key={tk.entry.id} className="absolute top-1/2" style={{ left: tk.x }}>
                  <div
                    className="absolute w-px"
                    style={{
                      height: stem,
                      background: active ? color : 'rgba(42,39,35,0.22)',
                      [up ? 'bottom' : 'top']: 0,
                    }}
                  />
                  <button
                    aria-label={`${tk.entry.restaurantName}, ${formatDate(tk.entry.dateTried)}`}
                    className="absolute -translate-x-1/2 cursor-pointer rounded-full transition-transform duration-150"
                    style={{
                      width: 13,
                      height: 13,
                      background: color,
                      border: '2px solid rgba(255,255,255,0.9)',
                      boxShadow: active ? `0 0 0 4px ${color}33, 0 2px 8px rgba(42,39,35,0.25)` : '0 1px 4px rgba(42,39,35,0.2)',
                      transform: `translateX(-50%) scale(${active ? 1.45 : 1})`,
                      [up ? 'bottom' : 'top']: stem - 6,
                    }}
                    onMouseEnter={() => setHovered(tk)}
                    onMouseLeave={() => setHovered((h) => (h?.entry.id === tk.entry.id ? null : h))}
                    onClick={() => openCountry(tk)}
                  />
                </div>
              )
            })}

            {/* expanded card for the hovered tick */}
            <AnimatePresence>
              {hovered && (
                <motion.div
                  key={hovered.entry.id}
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  className="glass pointer-events-none absolute z-10 w-64 -translate-x-1/2 rounded-xl p-3"
                  style={{
                    left: Math.min(Math.max(hovered.x, 150), width - 150),
                    [hovered.lane % 2 === 0 ? 'bottom' : 'top']: 'calc(50% + 76px)',
                  }}
                >
                  {hovered.entry.photos[0] && (
                    <img
                      src={resolvePhoto(hovered.entry.photos[0])}
                      className="mb-2 h-24 w-full rounded-lg object-cover"
                      alt=""
                    />
                  )}
                  <div className="text-[14px] leading-tight font-semibold">{hovered.entry.restaurantName}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {flagEmoji(hovered.entry.countryCode)} {hovered.countryName}
                    {hovered.entry.city && ` · ${hovered.entry.city}`}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-[11px] text-muted">
                      {hovered.user?.name} · {formatDate(hovered.entry.dateTried)}
                    </span>
                    <Stars rating={hovered.entry.rating} color={hovered.user?.color} size={10} />
                  </div>
                  {hovered.entry.signatureDish && (
                    <div className="font-display mt-1 text-[13px] italic">"{hovered.entry.signatureDish}"</div>
                  )}
                  {hovered.entry.notes && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{hovered.entry.notes}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </motion.section>
  )
}
