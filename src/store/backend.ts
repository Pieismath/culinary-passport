import type { Entry, EntryDraft, User, WishlistItem } from '../types'

export type AuthState = 'loading' | 'signedOut' | 'ready'

export type BackendSnapshot = {
  authState: AuthState
  currentUserId: string | null
  users: User[]
  entries: Entry[]
  wishlist: WishlistItem[]
}

/**
 * The app talks to one of two backends:
 *  - LocalBackend  — localStorage + IndexedDB, zero setup, seeded demo data
 *  - SupabaseBackend — Postgres + auth + storage + realtime
 * Chosen at startup by whether VITE_SUPABASE_* env vars are present.
 */
export interface Backend {
  readonly mode: 'local' | 'supabase'
  /** Load initial data; `onChange` fires on any local or remote mutation. */
  init(onChange: () => void): Promise<void>
  snapshot(): BackendSnapshot

  // auth
  selectLocalUser?(userId: string): void
  signIn?(email: string, password: string): Promise<void>
  signUp?(email: string, password: string, name: string): Promise<void>
  signOut(): Promise<void>
  resetLocalData?(): Promise<void>

  // data
  addEntry(draft: EntryDraft, photos: File[]): Promise<Entry>
  updateEntry(id: string, draft: EntryDraft, keptPhotos: string[], newPhotos: File[]): Promise<Entry>
  deleteEntry(id: string): Promise<void>
  toggleWishlist(countryCode: string): Promise<void>

  /** Map a stored photo URL (https://…, idb://…) to something an <img> can render. */
  resolvePhoto(url: string): string
}
