import type { CountryFeature, Geo } from '../types'
import { RARE_CODES } from '../config'

/** Natural Earth quirk: these have ISO_A2 = -99 in the 110m dataset. */
const ISO_FIX: Record<string, string> = {
  France: 'FR',
  Norway: 'NO',
  Kosovo: 'XK',
}

type RawFeature = {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
}

let cache: Promise<Geo> | null = null

export function loadGeo(): Promise<Geo> {
  cache ??= fetchGeo()
  return cache
}

async function fetchGeo(): Promise<Geo> {
  const res = await fetch('/data/countries.geojson')
  if (!res.ok) throw new Error(`Could not load country polygons (${res.status})`)
  const raw = (await res.json()) as { features: RawFeature[] }

  const features: CountryFeature[] = []
  const byCode = new Map<string, CountryFeature>()
  const continents = new Map<string, string[]>()

  for (const f of raw.features) {
    const p = f.properties
    let code = String(p.ISO_A2 ?? '')
    if (!/^[A-Z]{2}$/.test(code)) code = ISO_FIX[String(p.ADMIN)] ?? ''

    const interactive = /^[A-Z]{2}$/.test(code) && code !== 'AQ'
    const { centroid, spanDeg } = analyzeGeometry(f.geometry)

    const feature: CountryFeature = {
      type: 'Feature',
      geometry: f.geometry,
      properties: {
        code: interactive ? code : `_${String(p.ADM0_A3 ?? p.ADMIN)}`,
        name: String(p.NAME ?? p.ADMIN ?? 'Unknown'),
        continent: String(p.CONTINENT ?? ''),
        subregion: String(p.SUBREGION ?? ''),
        centroid,
        zoomAlt: Math.min(2.1, Math.max(0.65, spanDeg / 26 + 0.5)),
        interactive,
        rare: RARE_CODES.has(code),
      },
    }
    features.push(feature)
    if (interactive) {
      byCode.set(code, feature)
      const list = continents.get(feature.properties.continent) ?? []
      list.push(code)
      continents.set(feature.properties.continent, list)
    }
  }

  return { features, byCode, total: byCode.size, continents }
}

/**
 * Centroid + rough angular size, taken from the largest ring so sprawling
 * multipolygon countries (Fiji, USA) don't get dragged off-center.
 */
function analyzeGeometry(geometry: RawFeature['geometry']): {
  centroid: { lat: number; lng: number }
  spanDeg: number
} {
  const polys: number[][][][] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as number[][][]]
      : (geometry.coordinates as number[][][][])
  let best: number[][] = []
  let bestArea = -1
  for (const poly of polys) {
    const ring = poly[0] // outer ring
    if (!ring?.length) continue
    const area = Math.abs(shoelace(ring))
    if (area > bestArea) {
      bestArea = area
      best = ring
    }
  }
  if (best.length === 0) return { centroid: { lat: 0, lng: 0 }, spanDeg: 1 }
  let sLat = 0
  let sLng = 0
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
  const n = Math.max(1, best.length - 1) // last vertex repeats the first
  for (let i = 0; i < n; i++) {
    const [lng, lat] = best[i]
    sLng += lng
    sLat += lat
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng)
  }
  const span = Math.max(maxLat - minLat, (maxLng - minLng) * Math.cos(((sLat / n) * Math.PI) / 180))
  return { centroid: { lat: sLat / n, lng: sLng / n }, spanDeg: span }
}

function shoelace(ring: number[][]): number {
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return a / 2
}
