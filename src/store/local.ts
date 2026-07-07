import type { Entry, EntryDraft, User, WishlistItem } from '../types'
import type { Backend, BackendSnapshot } from './backend'
import { uid } from '../lib/format'
import { blobToDataUrl, compressPhoto, idbDeletePhotos, idbLoadAllPhotos, idbPutPhoto } from '../lib/photos'

const LS = {
  entries: 'cp:entries',
  wishlist: 'cp:wishlist',
  user: 'cp:user',
  seeded: 'cp:seeded',
}

const LOCAL_USERS: User[] = [
  { id: 'jason', name: 'Jason', color: '#3b82e0', homeCity: 'Sydney' },
  { id: 'jenn', name: 'Jenn', color: '#2fbf8a', homeCity: 'New York' },
]

const SEED_ENTRIES: Entry[] = [
  seed('jenn', 'JP', 'Ichiran', 'New York', '2025-11-22', 5, 'Solo booth, life-changing tonkotsu. Ordered extra noodles without shame.', 'Tonkotsu ramen'),
  seed('jason', 'JP', 'Chaco Ramen', 'Sydney', '2025-12-05', 4, 'Queued 40 minutes in the rain. Worth it.', 'Shoyu ramen'),
  seed('jason', 'TH', 'Chat Thai', 'Sydney', '2026-01-17', 5, 'Boat noodles at 1am — the broth is basically a spell.', 'Boat noodles'),
  seed('jenn', 'MX', 'Los Tacos No. 1', 'New York', '2026-02-08', 5, 'Adobada on a handmade tortilla, eaten standing up like the law requires.', 'Adobada taco'),
  seed('jason', 'LB', 'Zahli', 'Sydney', '2026-03-14', 4, 'The mezze kept coming and I kept saying yes.', 'Mixed mezze'),
  seed('jenn', 'ET', 'Bunna Cafe', 'New York', '2026-04-03', 4, 'Injera > forks. No further questions.', 'Veggie combo'),
  seed('jason', 'IT', 'Fabbrica', 'Sydney', '2026-05-09', 4, 'They finished the cacio e pepe inside a cheese wheel. Theatre.', 'Cacio e pepe'),
  seed('jenn', 'IT', "L'industrie", 'New York', '2026-05-24', 5, 'Burrata slice, folded, gone in ninety seconds.', 'Burrata slice'),
  seed('jenn', 'FR', 'Buvette', 'New York', '2026-06-12', 4, 'Croque madame and zero regrets.', 'Croque madame'),
]

function seed(
  userId: string, countryCode: string, restaurantName: string, city: string,
  dateTried: string, rating: number, notes: string, signatureDish: string,
): Entry {
  return {
    id: `seed-${userId}-${countryCode}`,
    userId, countryCode, restaurantName, city, dateTried, rating, notes, signatureDish,
    photos: [],
    wouldReturn: true,
    createdAt: `${dateTried}T12:00:00.000Z`,
  }
}

const SEED_WISHLIST: WishlistItem[] = [
  { countryCode: 'GE', userId: 'jenn', createdAt: '2026-06-20T12:00:00.000Z' },
  { countryCode: 'PE', userId: 'jason', createdAt: '2026-06-25T12:00:00.000Z' },
]

export class LocalBackend implements Backend {
  readonly mode = 'local' as const
  private entries: Entry[] = []
  private wishlist: WishlistItem[] = []
  private currentUserId: string | null = null
  private photos = new Map<string, string>()
  private onChange: () => void = () => {}

  async init(onChange: () => void): Promise<void> {
    this.onChange = onChange
    if (!localStorage.getItem(LS.seeded)) {
      localStorage.setItem(LS.entries, JSON.stringify(SEED_ENTRIES))
      localStorage.setItem(LS.wishlist, JSON.stringify(SEED_WISHLIST))
      localStorage.setItem(LS.seeded, '1')
    }
    this.load()
    try {
      this.photos = await idbLoadAllPhotos()
    } catch {
      this.photos = new Map()
    }
    // Keep two tabs in sync (poor man's realtime).
    window.addEventListener('storage', (e) => {
      if (e.key?.startsWith('cp:')) {
        this.load()
        void idbLoadAllPhotos().then((m) => {
          this.photos = m
          this.onChange()
        })
      }
    })
  }

  private load() {
    this.entries = readJson<Entry[]>(LS.entries) ?? []
    this.wishlist = readJson<WishlistItem[]>(LS.wishlist) ?? []
    this.currentUserId = localStorage.getItem(LS.user)
  }

  private persist() {
    localStorage.setItem(LS.entries, JSON.stringify(this.entries))
    localStorage.setItem(LS.wishlist, JSON.stringify(this.wishlist))
    this.onChange()
  }

  snapshot(): BackendSnapshot {
    return {
      authState: 'ready',
      currentUserId: this.currentUserId,
      users: LOCAL_USERS,
      entries: [...this.entries],
      wishlist: [...this.wishlist],
    }
  }

  selectLocalUser(userId: string): void {
    this.currentUserId = userId
    localStorage.setItem(LS.user, userId)
    this.onChange()
  }

  async signOut(): Promise<void> {
    this.currentUserId = null
    localStorage.removeItem(LS.user)
    this.onChange()
  }

  async resetLocalData(): Promise<void> {
    const ids = this.entries.flatMap((e) => e.photos.filter((p) => p.startsWith('idb://')).map((p) => p.slice(6)))
    await idbDeletePhotos(ids).catch(() => {})
    this.photos.clear()
    this.entries = []
    this.wishlist = []
    localStorage.setItem(LS.seeded, '1') // stay empty, don't re-seed
    this.persist()
  }

  private async storePhotos(files: File[]): Promise<string[]> {
    const urls: string[] = []
    for (const file of files) {
      const blob = await compressPhoto(file)
      const dataUrl = await blobToDataUrl(blob)
      const id = uid()
      await idbPutPhoto(id, dataUrl)
      this.photos.set(id, dataUrl)
      urls.push(`idb://${id}`)
    }
    return urls
  }

  async addEntry(draft: EntryDraft, photos: File[]): Promise<Entry> {
    if (!this.currentUserId) throw new Error('Pick who you are first')
    const entry: Entry = {
      ...draft,
      id: uid(),
      userId: this.currentUserId,
      photos: await this.storePhotos(photos),
      createdAt: new Date().toISOString(),
    }
    this.entries = [...this.entries, entry]
    this.persist()
    return entry
  }

  async updateEntry(id: string, draft: EntryDraft, keptPhotos: string[], newPhotos: File[]): Promise<Entry> {
    const prev = this.entries.find((e) => e.id === id)
    if (!prev) throw new Error('Entry not found')
    const dropped = prev.photos.filter((p) => !keptPhotos.includes(p) && p.startsWith('idb://')).map((p) => p.slice(6))
    await idbDeletePhotos(dropped).catch(() => {})
    dropped.forEach((d) => this.photos.delete(d))
    const entry: Entry = { ...prev, ...draft, photos: [...keptPhotos, ...(await this.storePhotos(newPhotos))] }
    this.entries = this.entries.map((e) => (e.id === id ? entry : e))
    this.persist()
    return entry
  }

  async deleteEntry(id: string): Promise<void> {
    const prev = this.entries.find((e) => e.id === id)
    if (prev) {
      const ids = prev.photos.filter((p) => p.startsWith('idb://')).map((p) => p.slice(6))
      await idbDeletePhotos(ids).catch(() => {})
      ids.forEach((i) => this.photos.delete(i))
    }
    this.entries = this.entries.filter((e) => e.id !== id)
    this.persist()
  }

  async toggleWishlist(countryCode: string): Promise<void> {
    if (!this.currentUserId) return
    const exists = this.wishlist.some((w) => w.countryCode === countryCode)
    this.wishlist = exists
      ? this.wishlist.filter((w) => w.countryCode !== countryCode)
      : [...this.wishlist, { countryCode, userId: this.currentUserId, createdAt: new Date().toISOString() }]
    this.persist()
  }

  resolvePhoto(url: string): string {
    if (url.startsWith('idb://')) return this.photos.get(url.slice(6)) ?? ''
    return url
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
