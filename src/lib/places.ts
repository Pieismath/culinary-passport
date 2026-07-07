/**
 * Restaurant search — autocomplete for the entry form and "find this cuisine
 * near me" for the globe spinner.
 *
 * Two providers behind one interface:
 *  - Google Places (New) — the default whenever VITE_GOOGLE_PLACES_API_KEY is set.
 *  - OpenStreetMap via Photon (komoot) — free, no API key, the open-source fallback.
 */

export type PlaceHit = {
  name: string
  locality: string
  lat?: number
  lng?: number
  /** Google Places id — only set when the hit came from Google. */
  placeId?: string
  rating?: number
  ratingCount?: number
}

export type Bias = {
  lat: number
  lng: number
  /** Shown in UI: "near you" (geolocation) or the city name we fell back to. */
  label: string
  /** True when this came from real geolocation, so distances are meaningful. */
  precise: boolean
} | null

const GOOGLE_KEY =
  ((import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined) ||
    (import.meta.env.VITE_GOOGLE_PLACES_KEY as string | undefined)) ??
  ''
export const placesProvider: 'google' | 'osm' = GOOGLE_KEY ? 'google' : 'osm'

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  sydney: { lat: -33.8688, lng: 151.2093 },
  'new york': { lat: 40.7128, lng: -74.006 },
  nyc: { lat: 40.7128, lng: -74.006 },
  philadelphia: { lat: 39.9526, lng: -75.1652 },
  philly: { lat: 39.9526, lng: -75.1652 },
}

const geocodeCache = new Map<string, { lat: number; lng: number } | null>()

async function cityCoords(city: string): Promise<{ lat: number; lng: number } | null> {
  const key = city.trim().toLowerCase()
  if (!key) return null
  for (const [name, coords] of Object.entries(CITY_COORDS)) {
    if (key.includes(name)) return coords
  }
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null
  try {
    const url = new URL('https://photon.komoot.io/api/')
    url.searchParams.set('q', city)
    url.searchParams.set('limit', '1')
    const res = await fetch(url)
    const json = (await res.json()) as { features?: { geometry: { coordinates: [number, number] } }[] }
    const c = json.features?.[0]?.geometry.coordinates
    const coords = c ? { lat: c[1], lng: c[0] } : null
    geocodeCache.set(key, coords)
    return coords
  } catch {
    return null
  }
}

function getPosition(timeoutMs: number): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'))
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: timeoutMs,
      maximumAge: 300_000,
    })
  })
}

/** Location bias without prompting: uses geolocation only if already granted. */
export async function passiveBias(homeCity: string): Promise<Bias> {
  try {
    const perm = await navigator.permissions.query({ name: 'geolocation' })
    if (perm.state === 'granted') {
      const pos = await getPosition(4000)
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'near you', precise: true }
    }
  } catch {
    // permissions API unavailable or lookup failed — fall through to the city
  }
  const c = await cityCoords(homeCity)
  return c ? { ...c, label: homeCity, precise: false } : null
}

/** Location bias that MAY prompt the user for geolocation permission. */
export async function requestBias(homeCity: string): Promise<Bias> {
  try {
    const pos = await getPosition(8000)
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'near you', precise: true }
  } catch {
    const c = await cityCoords(homeCity)
    return c ? { ...c, label: homeCity, precise: false } : null
  }
}

/** Bias anchored to a named city (no geolocation) — for the long-distance toggle. */
export async function cityBias(city: string): Promise<Bias> {
  const c = await cityCoords(city)
  return c ? { ...c, label: city, precise: false } : null
}

/** Autocomplete restaurant names as you type. */
export async function suggestRestaurants(query: string, bias: Bias, signal?: AbortSignal): Promise<PlaceHit[]> {
  if (placesProvider === 'google') return googleAutocomplete(query, bias, signal)
  // no distance cap: you might be logging a place from a past trip anywhere
  return photonSearch(query, bias, 6, signal)
}

/** Find restaurants serving a cuisine near a location (for the globe spinner). */
export async function findCuisineNearby(cuisine: string, bias: Bias, signal?: AbortSignal): Promise<PlaceHit[]> {
  if (placesProvider === 'google') return googleTextSearch(`${cuisine} restaurant`, bias, signal)
  // Photon's bias is soft — for "nearby" we mean it, so drop anything past ~60 km
  const hits = await photonSearch(`${cuisine} restaurant`, bias, 5, signal, bias ? 60 : undefined)
  return hits
}

export function mapsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

// ------------------------------------------------------------------ Photon (OSM)

async function photonSearch(
  query: string,
  bias: Bias,
  limit: number,
  signal?: AbortSignal,
  maxKm?: number,
): Promise<PlaceHit[]> {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(limit + 8)) // fetch extra, dedupe + filter below
  for (const tag of ['amenity:restaurant', 'amenity:cafe', 'amenity:fast_food']) {
    url.searchParams.append('osm_tag', tag)
  }
  if (bias) {
    url.searchParams.set('lat', String(bias.lat))
    url.searchParams.set('lon', String(bias.lng))
    url.searchParams.set('zoom', '13')
    url.searchParams.set('location_bias_scale', '0.6')
  }
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const json = (await res.json()) as {
    features?: {
      properties: Record<string, string | undefined>
      geometry: { coordinates: [number, number] }
    }[]
  }
  const seen = new Set<string>()
  const hits: PlaceHit[] = []
  for (const f of json.features ?? []) {
    const p = f.properties
    const name = p.name?.trim()
    if (!name) continue
    const lat = f.geometry.coordinates[1]
    const lng = f.geometry.coordinates[0]
    if (bias && maxKm != null && distanceKm(bias, { lat, lng }) > maxKm) continue
    const locality = p.city ?? p.town ?? p.village ?? p.suburb ?? p.state ?? ''
    const key = `${name.toLowerCase()}|${locality.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    hits.push({ name, locality, lat, lng })
    if (hits.length >= limit) break
  }
  return hits
}

// ------------------------------------------------------------------ Google Places (New)

async function googleAutocomplete(query: string, bias: Bias, signal?: AbortSignal): Promise<PlaceHit[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY },
    body: JSON.stringify({
      input: query,
      includedPrimaryTypes: ['restaurant'],
      ...(bias && {
        locationBias: { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 30000 } },
      }),
    }),
  })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const json = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId?: string
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }
      }
    }[]
  }
  return (json.suggestions ?? [])
    .map((s) => {
      const p = s.placePrediction
      return {
        name: p?.structuredFormat?.mainText?.text ?? '',
        locality: p?.structuredFormat?.secondaryText?.text?.split(',')[0] ?? '',
        placeId: p?.placeId,
      }
    })
    .filter((h) => h.name)
    .slice(0, 6)
}

/**
 * Fill in coordinates + a clean city name for an autocomplete pick.
 * Autocomplete predictions don't carry coordinates, so picking a Google hit
 * costs one Place Details call. Best-effort: returns the hit unchanged on failure.
 */
export async function resolvePlace(hit: PlaceHit): Promise<PlaceHit> {
  if (!hit.placeId || placesProvider !== 'google') return hit
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${hit.placeId}`, {
      headers: {
        'X-Goog-Api-Key': GOOGLE_KEY,
        'X-Goog-FieldMask': 'location,addressComponents',
      },
    })
    if (!res.ok) return hit
    const json = (await res.json()) as {
      location?: { latitude: number; longitude: number }
      addressComponents?: { longText?: string; types?: string[] }[]
    }
    const comp = (type: string) =>
      json.addressComponents?.find((c) => c.types?.includes(type))?.longText
    const city = comp('locality') ?? comp('postal_town') ?? comp('sublocality') ?? hit.locality
    return {
      ...hit,
      lat: json.location?.latitude ?? hit.lat,
      lng: json.location?.longitude ?? hit.lng,
      locality: city || hit.locality,
    }
  } catch {
    return hit
  }
}

async function googleTextSearch(query: string, bias: Bias, signal?: AbortSignal): Promise<PlaceHit[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_KEY,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount',
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: 5,
      ...(bias && {
        locationBias: { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 25000 } },
      }),
    }),
  })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const json = (await res.json()) as {
    places?: {
      id?: string
      displayName?: { text?: string }
      formattedAddress?: string
      location?: { latitude: number; longitude: number }
      rating?: number
      userRatingCount?: number
    }[]
  }
  return (json.places ?? [])
    .map((p) => ({
      name: p.displayName?.text ?? '',
      locality: p.formattedAddress?.split(',').slice(0, 2).join(',') ?? '',
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      placeId: p.id,
      rating: p.rating,
      ratingCount: p.userRatingCount,
    }))
    .filter((h) => h.name)
}
