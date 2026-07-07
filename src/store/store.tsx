import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import type {
  Entry, EntryDraft, FilterName, Geo, UnlockEvent, User, ViewName, WishlistItem,
} from '../types'
import type { Backend, BackendSnapshot } from './backend'
import { LocalBackend } from './local'
import { SupabaseBackend, hasSupabaseEnv } from './supabase'
import { loadGeo } from '../lib/geo'

export type Toast = { id: number; text: string; kind: 'info' | 'error' }

type ModalState = {
  countryCode?: string
  entry?: Entry
  /** Pre-filled fields when logging from a nearby-restaurant card. */
  prefill?: { restaurantName?: string; city?: string; placeId?: string; lat?: number; lng?: number }
} | null
type LightboxState = { photos: string[]; index: number } | null

type AppContextValue = {
  mode: 'local' | 'supabase'
  snap: BackendSnapshot
  geo: Geo | null
  geoError: string | null

  usersById: Map<string, User>
  currentUser: User | null
  entriesByCountry: Map<string, Entry[]>
  statusByCountry: Map<string, Set<string>>
  wishlistCodes: Set<string>
  progress: { total: number; either: number; both: number }

  view: ViewName
  setView: (v: ViewName) => void
  filter: FilterName
  setFilter: (f: FilterName) => void
  selectedCode: string | null
  setSelectedCode: (c: string | null) => void
  modal: ModalState
  setModal: (m: ModalState) => void
  lightbox: LightboxState
  setLightbox: (l: LightboxState) => void

  unlock: UnlockEvent | null
  clearUnlock: () => void
  toasts: Toast[]
  pushToast: (text: string, kind?: Toast['kind']) => void

  addEntry: (draft: EntryDraft, photos: File[]) => Promise<void>
  updateEntry: (id: string, draft: EntryDraft, keptPhotos: string[], newPhotos: File[]) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  toggleWishlist: (countryCode: string) => Promise<void>
  selectLocalUser: (id: string) => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
  resetLocalData: () => Promise<void>
  resolvePhoto: (url: string) => string
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp outside provider')
  return ctx
}

let toastSeq = 0

export function AppProvider({ children }: { children: ReactNode }) {
  const backendRef = useRef<Backend | null>(null)
  backendRef.current ??= hasSupabaseEnv ? new SupabaseBackend() : new LocalBackend()
  const backend = backendRef.current

  const [snap, setSnap] = useState<BackendSnapshot>(() => backend.snapshot())
  const [geo, setGeo] = useState<Geo | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)

  const [view, setView] = useState<ViewName>('globe')
  const [filter, setFilter] = useState<FilterName>('all')
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [lightbox, setLightbox] = useState<LightboxState>(null)
  const [unlock, setUnlock] = useState<UnlockEvent | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    void backend.init(() => setSnap(backend.snapshot())).then(() => setSnap(backend.snapshot()))
    loadGeo().then(setGeo, (e: Error) => setGeoError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pushToast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastSeq
    setToasts((t) => [...t, { id, text, kind }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const usersById = useMemo(() => new Map(snap.users.map((u) => [u.id, u])), [snap.users])
  const currentUser = snap.currentUserId ? (usersById.get(snap.currentUserId) ?? null) : null

  const entriesByCountry = useMemo(() => {
    const m = new Map<string, Entry[]>()
    for (const e of snap.entries) {
      const list = m.get(e.countryCode) ?? []
      list.push(e)
      m.set(e.countryCode, list)
    }
    for (const list of m.values()) list.sort((a, b) => b.dateTried.localeCompare(a.dateTried))
    return m
  }, [snap.entries])

  const statusByCountry = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const e of snap.entries) {
      const set = m.get(e.countryCode) ?? new Set<string>()
      set.add(e.userId)
      m.set(e.countryCode, set)
    }
    return m
  }, [snap.entries])

  const wishlistCodes = useMemo(
    () => new Set(snap.wishlist.map((w) => w.countryCode)),
    [snap.wishlist],
  )

  const progress = useMemo(() => {
    let both = 0
    for (const set of statusByCountry.values()) if (set.size >= 2) both++
    return { total: geo?.total ?? 0, either: statusByCountry.size, both }
  }, [statusByCountry, geo])

  const countryName = useCallback(
    (code: string) => geo?.byCode.get(code)?.properties.name ?? code,
    [geo],
  )

  const addEntry = useCallback(
    async (draft: EntryDraft, photos: File[]) => {
      const before = statusByCountry.get(draft.countryCode) ?? new Set<string>()
      const entry = await backend.addEntry(draft, photos)
      setSnap(backend.snapshot())
      const name = countryName(draft.countryCode)
      if (before.size === 0) {
        setUnlock({ kind: 'first', countryCode: draft.countryCode, countryName: name, userId: entry.userId, date: draft.dateTried })
      } else if (!before.has(entry.userId)) {
        setUnlock({ kind: 'together', countryCode: draft.countryCode, countryName: name, userId: entry.userId, date: draft.dateTried })
      } else {
        pushToast(`Logged ${draft.restaurantName}`)
      }
    },
    [backend, statusByCountry, countryName, pushToast],
  )

  const updateEntry = useCallback(
    async (id: string, draft: EntryDraft, keptPhotos: string[], newPhotos: File[]) => {
      await backend.updateEntry(id, draft, keptPhotos, newPhotos)
      setSnap(backend.snapshot())
      pushToast('Entry updated')
    },
    [backend, pushToast],
  )

  const deleteEntry = useCallback(
    async (id: string) => {
      await backend.deleteEntry(id)
      setSnap(backend.snapshot())
      pushToast('Entry deleted')
    },
    [backend, pushToast],
  )

  const toggleWishlist = useCallback(
    async (code: string) => {
      const was = wishlistCodes.has(code)
      await backend.toggleWishlist(code)
      setSnap(backend.snapshot())
      pushToast(was ? `${countryName(code)} removed from the queue` : `${countryName(code)} queued for later`)
    },
    [backend, wishlistCodes, countryName, pushToast],
  )

  const value: AppContextValue = {
    mode: backend.mode,
    snap,
    geo,
    geoError,
    usersById,
    currentUser,
    entriesByCountry,
    statusByCountry,
    wishlistCodes,
    progress,
    view,
    setView,
    filter,
    setFilter,
    selectedCode,
    setSelectedCode,
    modal,
    setModal,
    lightbox,
    setLightbox,
    unlock,
    clearUnlock: useCallback(() => setUnlock(null), []),
    toasts,
    pushToast,
    addEntry,
    updateEntry,
    deleteEntry,
    toggleWishlist,
    selectLocalUser: useCallback((id: string) => backend.selectLocalUser?.(id), [backend]),
    signIn: useCallback(async (e: string, p: string) => backend.signIn?.(e, p), [backend]),
    signUp: useCallback(async (e: string, p: string, n: string) => backend.signUp?.(e, p, n), [backend]),
    signOut: useCallback(() => backend.signOut(), [backend]),
    resetLocalData: useCallback(async () => backend.resetLocalData?.(), [backend]),
    resolvePhoto: useCallback((url: string) => backend.resolvePhoto(url), [backend]),
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
