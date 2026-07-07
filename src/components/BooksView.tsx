import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store/store'
import type { Entry, User } from '../types'
import { PURPLE } from '../config'
import { flagEmoji, formatDate, hexToRgba, plural } from '../lib/format'
import { Figure3D, type FigurePerson } from './Figure3D'
import { Icon } from './Icon'

/** Two little passport books — one each — with our figures standing over them. */
export function BooksView() {
  const { snap } = useApp()
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="sheet fixed inset-0 z-20 overflow-y-auto pt-24 pb-16"
    >
      <div className="mx-auto max-w-3xl px-8">
        <h2 className="font-display text-4xl italic">Passports</h2>
        <p className="mt-1.5 text-sm text-muted">One little book each — every cuisine you've stamped.</p>
        <div className="mt-8 grid gap-12 sm:grid-cols-2">
          {snap.users.map((u, i) => (
            <PassportBook key={u.id} user={u} person={i === 0 ? 'jason' : 'jenn'} />
          ))}
        </div>
      </div>
    </motion.section>
  )
}

function PassportBook({ user, person }: { user: User; person: FigurePerson }) {
  const { snap, geo, statusByCountry, setSelectedCode, setView } = useApp()
  const [hover, setHover] = useState(false)

  const { stamps, meals } = useMemo(() => {
    const mine = snap.entries
      .filter((e) => e.userId === user.id)
      .sort((a, b) => a.dateTried.localeCompare(b.dateTried) || a.createdAt.localeCompare(b.createdAt))
    const first = new Map<string, Entry>()
    for (const e of mine) if (!first.has(e.countryCode)) first.set(e.countryCode, e)
    const stamps = [...first.values()].map((e) => ({
      code: e.countryCode,
      name: geo?.byCode.get(e.countryCode)?.properties.name ?? e.countryCode,
      date: e.dateTried,
      shared: (statusByCountry.get(e.countryCode)?.size ?? 0) >= 2,
      rare: geo?.byCode.get(e.countryCode)?.properties.rare ?? false,
    }))
    return { stamps, meals: mine.length }
  }, [snap.entries, user.id, geo, statusByCountry])

  const coverTop = shade(user.color, 0.42)
  const coverBottom = shade(user.color, 0.28)

  return (
    <div
      className="flex flex-col items-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Figure3D person={person} wave={hover} />

      {/* the little book */}
      <div
        className="mt-1 w-full max-w-[300px] rounded-2xl p-6 text-center shadow-lg"
        style={{
          background: `linear-gradient(165deg, ${coverTop}, ${coverBottom})`,
          color: '#f3ecdb',
          boxShadow: `0 14px 30px -14px ${hexToRgba(user.color, 0.55)}`,
        }}
      >
        <div className="rounded-xl border border-[#f3ecdb]/35 px-4 py-5">
          <div className="mx-auto mb-2 w-fit opacity-90">
            <Icon name="globe" size={22} />
          </div>
          <div className="text-[9px] font-semibold tracking-[0.34em] uppercase opacity-80">Culinary Passport</div>
          <div className="font-display mt-1.5 text-2xl italic">{user.name}</div>
          <div className="mt-1 text-[11px] opacity-85">
            {plural(stamps.length, 'cuisine')} · {plural(meals, 'meal')}
          </div>
        </div>
      </div>

      {/* stamped pages */}
      <div className="mt-4 flex w-full max-w-[300px] flex-col gap-2">
        {stamps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-muted">
            No stamps yet — spin the globe.
          </div>
        ) : (
          stamps.map((s) => (
            <button
              key={s.code}
              className="card flex cursor-pointer items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition hover:border-[rgba(42,39,35,0.25)]"
              onClick={() => {
                setView('globe')
                setSelectedCode(s.code)
              }}
            >
              <span className="text-base">{flagEmoji(s.code)}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{s.name}</span>
              {s.rare && <span className="text-[10px] text-amber">✦</span>}
              {s.shared && (
                <span style={{ color: PURPLE }}>
                  <Icon name="heart" size={11} fill />
                </span>
              )}
              <span className="text-[11px] text-muted tabular-nums">{formatDate(s.date)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/** Darken a hex color toward ink for the book cover. */
function shade(hex: string, keep: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  const mix = (c: number) => Math.round(c * keep + 26 * (1 - keep))
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`
}
