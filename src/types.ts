export type User = {
  id: string
  name: string
  color: string
  homeCity: string
}

export type Entry = {
  id: string
  userId: string
  countryCode: string
  restaurantName: string
  city: string
  dateTried: string // yyyy-mm-dd
  rating: number // 1-5
  notes: string
  signatureDish: string
  photos: string[]
  wouldReturn: boolean
  createdAt: string
  /** Google Places id + coordinates, when the restaurant was picked from autocomplete. */
  placeId?: string
  lat?: number
  lng?: number
}

/** Fields the entry form collects; id/userId/photos are attached by the backend. */
export type EntryDraft = {
  countryCode: string
  restaurantName: string
  city: string
  dateTried: string
  rating: number
  notes: string
  signatureDish: string
  wouldReturn: boolean
  placeId?: string
  lat?: number
  lng?: number
}

export type WishlistItem = {
  countryCode: string
  userId: string
  createdAt: string
}

export type UnlockEvent = {
  kind: 'first' | 'together'
  countryCode: string
  countryName: string
  userId: string
  date: string
}

export type CountryProps = {
  code: string
  name: string
  continent: string
  subregion: string
  centroid: { lat: number; lng: number }
  zoomAlt: number
  interactive: boolean
  rare: boolean
}

export type CountryFeature = {
  type: 'Feature'
  properties: CountryProps
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
}

export type Geo = {
  features: CountryFeature[]
  byCode: Map<string, CountryFeature>
  /** Number of selectable countries — drives the "x / N" progress. */
  total: number
  continents: Map<string, string[]> // continent -> country codes
}

export type ViewName = 'globe' | 'timeline' | 'books'
export type FilterName = 'all' | 'together' | 'queued'
