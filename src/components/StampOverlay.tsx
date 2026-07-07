import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store/store'
import { PURPLE } from '../config'
import { flagEmoji, formatDate } from '../lib/format'
import { Icon } from './Icon'

/** Ink-stamp thud when a country unlocks (first taste, or completed together). */
export function StampOverlay() {
  const { unlock, clearUnlock, usersById } = useApp()

  useEffect(() => {
    if (!unlock) return
    const t = window.setTimeout(clearUnlock, 2600)
    return () => window.clearTimeout(t)
  }, [unlock, clearUnlock])

  const user = unlock ? usersById.get(unlock.userId) : null
  const color = unlock?.kind === 'together' ? PURPLE : (user?.color ?? '#c98a2e')

  return (
    <AnimatePresence>
      {unlock && (
        <motion.div
          key={`${unlock.countryCode}-${unlock.kind}`}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
        >
          {/* thud flash */}
          <motion.div
            className="absolute h-72 w-72 rounded-full"
            style={{ background: `radial-gradient(circle, ${color}33, transparent 65%)` }}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1.7, opacity: [0, 0.9, 0] }}
            transition={{ duration: 0.7, times: [0, 0.25, 1] }}
          />
          <motion.div
            className="stamp flex flex-col items-center gap-1.5 px-10 py-7 text-center"
            style={{ color, background: 'rgba(255,255,255,0.86)', backdropFilter: 'blur(5px)' }}
            initial={{ scale: 2.6, opacity: 0, rotate: -22 }}
            animate={{ scale: 1, opacity: 1, rotate: -7 }}
            transition={{ type: 'spring', stiffness: 320, damping: 17, mass: 0.9 }}
          >
            <div className="text-[10px] font-semibold tracking-[0.3em] uppercase opacity-80">
              Culinary Passport
            </div>
            <div className="font-display flex items-center gap-3 text-4xl font-semibold">
              <span>{flagEmoji(unlock.countryCode)}</span>
              {unlock.countryName}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold tracking-[0.22em] uppercase">
              {unlock.kind === 'together' ? (
                <>
                  <Icon name="heart" size={12} fill /> Tasted together <Icon name="heart" size={12} fill />
                </>
              ) : (
                <>{user?.name ?? 'First'}'s first taste</>
              )}
            </div>
            <div className="text-[11px] tracking-[0.18em] uppercase opacity-80">{formatDate(unlock.date)}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
