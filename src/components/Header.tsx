import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store/store'
import type { FilterName, ViewName } from '../types'
import { ProgressRings } from './ProgressRings'
import { Avatar } from './Avatars'
import { Icon } from './Icon'

const VIEWS: { id: ViewName; label: string; icon: 'globe' | 'clock' | 'book' }[] = [
  { id: 'globe', label: 'Globe', icon: 'globe' },
  { id: 'timeline', label: 'Journal', icon: 'clock' },
  { id: 'books', label: 'Passports', icon: 'book' },
]

const FILTERS: { id: FilterName; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'together', label: 'Together' },
  { id: 'queued', label: 'Queued' },
]

export function Header() {
  const { view, setView, filter, setFilter, mode } = useApp()

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2.5">
        <span className="text-amber">
          <Icon name="globe" size={20} />
        </span>
        <h1 className="font-display truncate text-lg tracking-tight italic">Culinary Passport</h1>
        {mode === 'local' && (
          <span
            className="chip cursor-default text-[10px]"
            title="Running on local demo data — connect Supabase to sync between you two (see README)"
          >
            demo
          </span>
        )}
      </div>

      <nav className="pointer-events-auto glass absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full p-1">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
              view === v.id ? 'text-text' : 'text-muted hover:text-text'
            }`}
          >
            {view === v.id && (
              <motion.span
                layoutId="view-pill"
                className="absolute inset-0 rounded-full bg-[rgba(42,39,35,0.09)]"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <Icon name={v.icon} size={14} />
              <span className="hidden md:inline">{v.label}</span>
            </span>
          </button>
        ))}
      </nav>

      <div className="pointer-events-auto flex items-center gap-4">
        {view === 'globe' && (
          <div className="hidden items-center gap-1.5 lg:flex">
            {FILTERS.map((f) => (
              <button key={f.id} className={`chip ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        )}
        <div className="glass hidden rounded-full py-1.5 pr-4 pl-3 sm:block">
          <ProgressRings />
        </div>
        <UserChip />
      </div>
    </header>
  )
}

function UserChip() {
  const { currentUser, snap, mode, selectLocalUser, signOut, resetLocalData, pushToast } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  if (!currentUser) return null
  return (
    <div className="relative" ref={ref}>
      <button className="glass flex items-center gap-2 rounded-full p-1.5 pr-2.5" onClick={() => setOpen((o) => !o)}>
        <Avatar user={currentUser} size={26} />
        <span className="hidden text-[13px] font-medium sm:inline">{currentUser.name}</span>
        <Icon name="chevron" size={12} className="text-muted" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="glass absolute top-full right-0 z-50 mt-2 w-52 rounded-xl p-1.5"
          >
            {mode === 'local' && (
              <>
                <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold tracking-[0.14em] text-muted uppercase">
                  Logging as
                </div>
                {snap.users.map((u) => (
                  <button
                    key={u.id}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-black/5"
                    onClick={() => {
                      selectLocalUser(u.id)
                      setOpen(false)
                    }}
                  >
                    <Avatar user={u} size={22} />
                    <span className="flex-1">{u.name}</span>
                    {u.id === currentUser.id && <Icon name="check" size={14} className="text-muted" />}
                  </button>
                ))}
                <div className="my-1.5 border-t border-line" />
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-muted hover:bg-black/5 hover:text-text"
                  onClick={() => {
                    if (window.confirm('Clear all entries, photos and the wishlist on this device?')) {
                      void resetLocalData().then(() => pushToast('Fresh passport — start eating'))
                    }
                    setOpen(false)
                  }}
                >
                  <Icon name="trash" size={14} /> Clear all data
                </button>
              </>
            )}
            {mode === 'supabase' && (
              <button
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-muted hover:bg-black/5 hover:text-text"
                onClick={() => void signOut()}
              >
                <Icon name="x" size={14} /> Sign out
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
