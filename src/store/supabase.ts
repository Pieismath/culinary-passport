import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Entry, EntryDraft, User, WishlistItem } from '../types'
import type { Backend, BackendSnapshot, AuthState } from './backend'
import { compressPhoto } from '../lib/photos'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

export const hasSupabaseEnv = SUPABASE_URL.length > 0 && SUPABASE_KEY.length > 0

const USER_COLORS = ['#3b82e0', '#2fbf8a']
const BUCKET = 'photos'

type EntryRow = {
  id: string
  user_id: string
  country_code: string
  restaurant_name: string
  city: string | null
  date_tried: string
  rating: number
  notes: string | null
  signature_dish: string | null
  photos: string[] | null
  would_return: boolean | null
  created_at: string
  place_id: string | null
  lat: number | null
  lng: number | null
}

function rowToEntry(r: EntryRow): Entry {
  return {
    id: r.id,
    userId: r.user_id,
    countryCode: r.country_code,
    restaurantName: r.restaurant_name,
    city: r.city ?? '',
    dateTried: r.date_tried,
    rating: r.rating,
    notes: r.notes ?? '',
    signatureDish: r.signature_dish ?? '',
    photos: r.photos ?? [],
    wouldReturn: r.would_return ?? true,
    createdAt: r.created_at,
    placeId: r.place_id ?? undefined,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
  }
}

function draftToRow(draft: EntryDraft) {
  return {
    country_code: draft.countryCode,
    restaurant_name: draft.restaurantName,
    city: draft.city,
    date_tried: draft.dateTried,
    rating: draft.rating,
    notes: draft.notes,
    signature_dish: draft.signatureDish,
    would_return: draft.wouldReturn,
    place_id: draft.placeId ?? null,
    lat: draft.lat ?? null,
    lng: draft.lng ?? null,
  }
}

export class SupabaseBackend implements Backend {
  readonly mode = 'supabase' as const
  private client: SupabaseClient
  private authState: AuthState = 'loading'
  private currentUserId: string | null = null
  private users: User[] = []
  private entries: Entry[] = []
  private wishlist: WishlistItem[] = []
  private onChange: () => void = () => {}

  constructor() {
    this.client = createClient(SUPABASE_URL, SUPABASE_KEY)
  }

  async init(onChange: () => void): Promise<void> {
    this.onChange = onChange
    const { data } = await this.client.auth.getSession()
    await this.handleSession(Boolean(data.session?.user), data.session?.user?.id ?? null)
    this.client.auth.onAuthStateChange((_evt, session) => {
      void this.handleSession(Boolean(session?.user), session?.user?.id ?? null)
    })
    this.client
      .channel('cp-db')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, () => void this.reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wishlist' }, () => void this.reload())
      .subscribe()
  }

  private async handleSession(signedIn: boolean, userId: string | null) {
    if (!signedIn) {
      this.authState = 'signedOut'
      this.currentUserId = null
      this.onChange()
      return
    }
    this.currentUserId = userId
    await this.ensureProfile(userId!)
    await this.reload()
    this.authState = 'ready'
    this.onChange()
  }

  /** The DB trigger normally creates the profile; this is a safety net. */
  private async ensureProfile(userId: string) {
    const { data } = await this.client.from('profiles').select('id').eq('id', userId).maybeSingle()
    if (data) return
    const { data: all } = await this.client.from('profiles').select('color')
    const used = new Set((all ?? []).map((p: { color: string }) => p.color))
    const color = USER_COLORS.find((c) => !used.has(c)) ?? '#c98a2e'
    const { data: userData } = await this.client.auth.getUser()
    const name =
      (userData.user?.user_metadata?.name as string | undefined) ??
      userData.user?.email?.split('@')[0] ??
      'Someone'
    await this.client.from('profiles').insert({ id: userId, name, color, home_city: '' })
  }

  private async reload() {
    const [profiles, entries, wishlist] = await Promise.all([
      this.client.from('profiles').select('*').order('created_at', { ascending: true }),
      this.client.from('entries').select('*').order('date_tried', { ascending: false }),
      this.client.from('wishlist').select('*'),
    ])
    this.users = (profiles.data ?? []).map((p: Record<string, unknown>) => ({
      id: String(p.id),
      name: String(p.name ?? 'Someone'),
      color: String(p.color ?? '#c98a2e'),
      homeCity: String(p.home_city ?? ''),
    }))
    this.entries = ((entries.data ?? []) as EntryRow[]).map(rowToEntry)
    this.wishlist = ((wishlist.data ?? []) as Record<string, string>[]).map((w) => ({
      countryCode: w.country_code,
      userId: w.user_id,
      createdAt: w.created_at,
    }))
    this.onChange()
  }

  snapshot(): BackendSnapshot {
    return {
      authState: this.authState,
      currentUserId: this.currentUserId,
      users: [...this.users],
      entries: [...this.entries],
      wishlist: [...this.wishlist],
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
  }

  async signUp(email: string, password: string, name: string): Promise<void> {
    const { error } = await this.client.auth.signUp({ email, password, options: { data: { name } } })
    if (error) throw new Error(error.message)
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut()
  }

  private async uploadPhotos(files: File[]): Promise<string[]> {
    const urls: string[] = []
    for (const file of files) {
      const blob = await compressPhoto(file)
      const path = `${this.currentUserId}/${crypto.randomUUID()}.jpg`
      const { error } = await this.client.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
      if (error) throw new Error(`Photo upload failed: ${error.message}`)
      urls.push(this.client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)
    }
    return urls
  }

  private storagePathOf(url: string): string | null {
    const marker = `/object/public/${BUCKET}/`
    const i = url.indexOf(marker)
    return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length))
  }

  async addEntry(draft: EntryDraft, photos: File[]): Promise<Entry> {
    if (!this.currentUserId) throw new Error('Not signed in')
    const photoUrls = await this.uploadPhotos(photos)
    const { data, error } = await this.client
      .from('entries')
      .insert({ ...draftToRow(draft), user_id: this.currentUserId, photos: photoUrls })
      .select()
      .single()
    if (error) throw new Error(error.message)
    await this.reload()
    return rowToEntry(data as EntryRow)
  }

  async updateEntry(id: string, draft: EntryDraft, keptPhotos: string[], newPhotos: File[]): Promise<Entry> {
    const prev = this.entries.find((e) => e.id === id)
    const droppedPaths = (prev?.photos ?? [])
      .filter((p) => !keptPhotos.includes(p))
      .map((p) => this.storagePathOf(p))
      .filter((p): p is string => Boolean(p))
    if (droppedPaths.length) await this.client.storage.from(BUCKET).remove(droppedPaths).catch(() => {})
    const photoUrls = [...keptPhotos, ...(await this.uploadPhotos(newPhotos))]
    const { data, error } = await this.client
      .from('entries')
      .update({ ...draftToRow(draft), photos: photoUrls })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    await this.reload()
    return rowToEntry(data as EntryRow)
  }

  async deleteEntry(id: string): Promise<void> {
    const prev = this.entries.find((e) => e.id === id)
    const paths = (prev?.photos ?? []).map((p) => this.storagePathOf(p)).filter((p): p is string => Boolean(p))
    if (paths.length) await this.client.storage.from(BUCKET).remove(paths).catch(() => {})
    const { error } = await this.client.from('entries').delete().eq('id', id)
    if (error) throw new Error(error.message)
    await this.reload()
  }

  async toggleWishlist(countryCode: string): Promise<void> {
    if (!this.currentUserId) return
    const mine = this.wishlist.find((w) => w.countryCode === countryCode)
    if (mine) {
      await this.client.from('wishlist').delete().eq('country_code', countryCode)
    } else {
      await this.client.from('wishlist').insert({ country_code: countryCode, user_id: this.currentUserId })
    }
    await this.reload()
  }

  resolvePhoto(url: string): string {
    return url
  }
}
