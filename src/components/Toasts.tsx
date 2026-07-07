import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store/store'

export function Toasts() {
  const { toasts } = useApp()
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 14, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="glass rounded-full px-4 py-2 text-[13px]"
            style={t.kind === 'error' ? { borderColor: 'rgba(190, 80, 70, 0.45)', color: '#b3433a' } : undefined}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
