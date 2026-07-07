import { AnimatePresence } from 'framer-motion'
import { AppProvider, useApp } from './store/store'
import { GlobeView } from './components/GlobeView'
import { Header } from './components/Header'
import { CountryPanel } from './components/CountryPanel'
import { EntryModal } from './components/EntryModal'
import { TimelineView } from './components/TimelineView'
import { BooksView } from './components/BooksView'
import { StampOverlay } from './components/StampOverlay'
import { Lightbox } from './components/Lightbox'
import { Toasts } from './components/Toasts'
import { ErrorScreen, SignIn, Splash, UserPicker } from './components/AuthGate'

export default function App() {
  return (
    <AppProvider>
      <div className="paper-bg fixed inset-0 overflow-hidden">
        <Shell />
        <Toasts />
        <InkFilter />
      </div>
    </AppProvider>
  )
}

function Shell() {
  const { geo, geoError, snap, mode, view } = useApp()

  if (geoError) return <ErrorScreen message={`The map refused to load: ${geoError}`} />
  if (!geo || snap.authState === 'loading') return <Splash />
  if (mode === 'supabase' && snap.authState === 'signedOut') return <SignIn />
  if (mode === 'local' && !snap.currentUserId) return <UserPicker />

  return (
    <>
      <GlobeView />
      <AnimatePresence>
        {view === 'timeline' && <TimelineView key="timeline" />}
        {view === 'books' && <BooksView key="books" />}
      </AnimatePresence>
      <Header />
      <CountryPanel />
      <EntryModal />
      <Lightbox />
      <StampOverlay />
    </>
  )
}

/** Shared SVG filter that roughens stamp edges like real ink. */
function InkFilter() {
  return (
    <svg width="0" height="0" className="absolute">
      <filter id="ink">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" />
      </filter>
    </svg>
  )
}
