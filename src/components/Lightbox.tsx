import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store/store'
import { Icon } from './Icon'

export function Lightbox() {
  const { lightbox, setLightbox, resolvePhoto } = useApp()

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
      if (e.key === 'ArrowRight') setLightbox({ ...lightbox, index: (lightbox.index + 1) % lightbox.photos.length })
      if (e.key === 'ArrowLeft')
        setLightbox({ ...lightbox, index: (lightbox.index - 1 + lightbox.photos.length) % lightbox.photos.length })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, setLightbox])

  return (
    <AnimatePresence>
      {lightbox && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/88"
          onClick={() => setLightbox(null)}
        >
          <motion.img
            key={lightbox.index}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            src={resolvePhoto(lightbox.photos[lightbox.index])}
            className="max-h-[88vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            alt=""
          />
          {lightbox.photos.length > 1 && (
            <>
              <button
                className="btn absolute left-5"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightbox({ ...lightbox, index: (lightbox.index - 1 + lightbox.photos.length) % lightbox.photos.length })
                }}
                aria-label="Previous photo"
              >
                <Icon name="chevron" className="rotate-90" />
              </button>
              <button
                className="btn absolute right-5"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightbox({ ...lightbox, index: (lightbox.index + 1) % lightbox.photos.length })
                }}
                aria-label="Next photo"
              >
                <Icon name="chevron" className="-rotate-90" />
              </button>
            </>
          )}
          <button className="btn absolute top-5 right-5" onClick={() => setLightbox(null)} aria-label="Close">
            <Icon name="x" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
