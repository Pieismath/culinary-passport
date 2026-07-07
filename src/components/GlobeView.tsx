import { useCallback, useEffect, useRef, useState } from 'react'
import Globe, { type GlobeInstance } from 'globe.gl'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store/store'
import type { CountryFeature } from '../types'
import { AMBER, PURPLE, cuisineName } from '../config'
import { flagEmoji, formatDate, hexToRgba, plural } from '../lib/format'
import {
  cityBias, distanceKm, findCuisineNearby, mapsUrl, passiveBias, requestBias,
  type Bias, type PlaceHit,
} from '../lib/places'
import { Avatar } from './Avatars'
import { Stars } from './StarRating'
import { Icon } from './Icon'

const UNTOUCHED = (boost: number) => `rgba(214, 207, 191, ${0.55 + boost})`
const DIMMED = (boost: number) => `rgba(214, 207, 191, ${0.3 + boost * 0.5})`

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function GlobeView() {
  const app = useApp()
  const {
    geo, statusByCountry, wishlistCodes, usersById, filter, selectedCode, setSelectedCode,
    setModal, toggleWishlist, entriesByCountry, snap, view, modal, pushToast, currentUser,
  } = app

  const wrapRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeInstance | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const suppressClickRef = useRef(false)
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null)

  const [hovered, setHovered] = useState<CountryFeature | null>(null)
  const [pick, setPick] = useState<CountryFeature | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [nearby, setNearby] = useState<{ hits: PlaceHit[]; bias: Bias } | null>(null)
  const [nearbyBusy, setNearbyBusy] = useState(false)
  const [searchAs, setSearchAs] = useState<string>('me') // 'me' | userId — long-distance toggle
  const myBiasRef = useRef<Bias>(null) // cached geolocation so we only prompt once per session

  // Latest state readable from globe accessor callbacks without re-mounting them.
  const stateRef = useRef({
    status: statusByCountry,
    wish: wishlistCodes,
    users: usersById,
    filter,
    selected: selectedCode,
    hovered: null as CountryFeature | null,
  })

  const capColor = useCallback((obj: object): string => {
    const f = obj as CountryFeature
    const p = f.properties
    const s = stateRef.current
    if (!p.interactive) return 'rgba(214, 207, 191, 0.4)'
    const boost = s.selected === p.code ? 0.22 : s.hovered === f ? 0.14 : 0
    const tried = s.status.get(p.code)
    const both = Boolean(tried && tried.size >= 2)
    if (s.filter === 'queued') return s.wish.has(p.code) ? hexToRgba(AMBER, 0.55 + boost) : DIMMED(boost)
    if (s.filter === 'together') return both ? hexToRgba(PURPLE, 0.68 + boost) : DIMMED(boost)
    if (!tried || tried.size === 0) return UNTOUCHED(boost)
    if (both) return hexToRgba(PURPLE, 0.66 + boost)
    const user = s.users.get([...tried][0])
    return hexToRgba(user?.color ?? AMBER, 0.62 + boost)
  }, [])

  const strokeColor = useCallback((obj: object): string => {
    const f = obj as CountryFeature
    if (!f.properties.interactive) return 'rgba(112, 105, 92, 0.16)'
    if (stateRef.current.wish.has(f.properties.code)) return hexToRgba(AMBER, 0.95)
    return 'rgba(112, 105, 92, 0.32)'
  }, [])

  const altitude = useCallback((obj: object): number => {
    const f = obj as CountryFeature
    const s = stateRef.current
    if (!f.properties.interactive) return 0.004
    if (s.selected === f.properties.code) return 0.03
    if (s.hovered === f) return 0.018
    return 0.007
  }, [])

  // Mount the globe once the polygons are loaded.
  useEffect(() => {
    const el = wrapRef.current
    if (!geo || !el || globeRef.current) return

    const globe = new Globe(el, { animateIn: true, rendererConfig: { alpha: true, antialias: true } })
    globeRef.current = globe
    if (import.meta.env.DEV) (window as unknown as { __globe?: GlobeInstance }).__globe = globe
    globe
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true)
      .atmosphereColor('#c9d6e6')
      .atmosphereAltitude(0.12)
      .polygonsData(geo.features as unknown as object[])
      .polygonsTransitionDuration(300)
      .polygonCapColor(capColor)
      .polygonStrokeColor(strokeColor)
      .polygonSideColor(() => 'rgba(112, 105, 92, 0.05)')
      .polygonAltitude(altitude)
      .onPolygonHover((p) => {
        stateRef.current.hovered = p as CountryFeature | null
        setHovered(p as CountryFeature | null)
      })
      .onPolygonClick((p) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false
          return
        }
        const f = p as CountryFeature | null
        if (!f?.properties.interactive) return
        setPick(null)
        setSelectedCode(f.properties.code)
      })

    // Pale ocean sphere — light and papery, no drama.
    const mat = globe.globeMaterial() as unknown as {
      color: { set: (c: string) => void }
      emissive?: { set: (c: string) => void }
      emissiveIntensity?: number
      specular?: { set: (c: string) => void }
      shininess?: number
    }
    mat.color.set('#d8e2eb')
    mat.emissive?.set('#a9bccd')
    mat.emissiveIntensity = 0.38
    mat.specular?.set('#ffffff')
    mat.shininess = 4

    globe.width(el.clientWidth).height(el.clientHeight)
    globe.pointOfView({ lat: 16, lng: 14, altitude: 2.4 }, 0)
    const controls = globe.controls()
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.42
    controls.minDistance = 135
    controls.maxDistance = 480

    const ro = new ResizeObserver(() => {
      globe.width(el.clientWidth)
      globe.height(el.clientHeight)
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      globe._destructor()
      globeRef.current = null
    }
  }, [geo, capColor, strokeColor, altitude, setSelectedCode])

  // Push fresh state into accessor callbacks and trigger a repaint.
  useEffect(() => {
    stateRef.current = {
      ...stateRef.current,
      status: statusByCountry,
      wish: wishlistCodes,
      users: usersById,
      filter,
      selected: selectedCode,
      hovered,
    }
    const g = globeRef.current
    if (!g) return
    g.polygonCapColor((o: object) => capColor(o))
      .polygonStrokeColor((o: object) => strokeColor(o))
      .polygonAltitude((o: object) => altitude(o))
  }, [statusByCountry, wishlistCodes, usersById, filter, selectedCode, hovered, capColor, strokeColor, altitude])

  // Ambient rotation pauses while the user is looking at something.
  useEffect(() => {
    const g = globeRef.current
    if (!g) return
    g.controls().autoRotate = view === 'globe' && !hovered && !selectedCode && !pick && !modal && !spinning
  }, [hovered, selectedCode, pick, modal, view, spinning, geo])

  // Fly to a country when it becomes selected (click, timeline, picker…).
  useEffect(() => {
    const g = globeRef.current
    if (!g || !selectedCode || !geo) return
    const f = geo.byCode.get(selectedCode)
    if (f) g.pointOfView({ ...f.properties.centroid, altitude: Math.max(0.95, f.properties.zoomAlt) }, 900)
  }, [selectedCode, geo])

  // ---- hover card placement (direct DOM writes, no re-render per mousemove)
  const placeCard = useCallback(() => {
    const card = cardRef.current
    if (!card) return
    const { x, y } = pointerRef.current
    const w = card.offsetWidth || 300
    const h = card.offsetHeight || 160
    const left = Math.min(x + 18, window.innerWidth - w - 16)
    const top = Math.min(y + 18, window.innerHeight - h - 16)
    card.style.transform = `translate(${left}px, ${top}px)`
  }, [])

  useEffect(() => {
    placeCard()
  }, [hovered, placeCard])

  // ---- long-press to queue
  const cancelLongPress = useCallback(() => {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current.timer)
      longPressRef.current = null
    }
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      cancelLongPress()
      const f = stateRef.current.hovered
      if (!f?.properties.interactive) return
      const code = f.properties.code
      const timer = window.setTimeout(() => {
        suppressClickRef.current = true
        longPressRef.current = null
        void toggleWishlist(code)
      }, 550)
      longPressRef.current = { timer, x: e.clientX, y: e.clientY }
    },
    [cancelLongPress, toggleWishlist],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY }
      placeCard()
      const lp = longPressRef.current
      if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) cancelLongPress()
    },
    [placeCard, cancelLongPress],
  )

  // ---- random dinner picker — candidate pool respects the active filter
  const spin = useCallback(async () => {
    const g = globeRef.current
    if (!g || !geo || spinning) return
    const untried = (code: string) => {
      const tried = statusByCountry.get(code)
      // "together" mode spins for cuisines you haven't SHARED yet; others for fully untried
      return filter === 'together' ? !tried || tried.size < 2 : !tried || tried.size === 0
    }
    const candidates = geo.features.filter((f) => {
      const p = f.properties
      if (!p.interactive || !untried(p.code)) return false
      return filter === 'queued' ? wishlistCodes.has(p.code) : true
    })
    if (candidates.length === 0) {
      pushToast(
        filter === 'queued'
          ? 'Nothing untried in the queue — hold a country to queue it'
          : filter === 'together'
            ? 'You two have shared every cuisine 🎉'
            : 'Nothing left to try — you two finished the world 🎉',
      )
      return
    }
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    setPick(null)
    setNearby(null)
    setSelectedCode(null)
    setSpinning(true)
    const start = g.pointOfView()
    g.pointOfView({ lat: 18, lng: start.lng + 150, altitude: 2.35 }, 620)
    await sleep(630)
    g.pointOfView({ lat: target.properties.centroid.lat, lng: start.lng + 285, altitude: 2.1 }, 620)
    await sleep(630)
    g.pointOfView({ ...target.properties.centroid, altitude: Math.max(1.15, target.properties.zoomAlt) }, 950)
    await sleep(1000)
    setSpinning(false)
    setPick(target)
  }, [geo, spinning, statusByCountry, filter, wishlistCodes, pushToast, setSelectedCode])

  const runSearch = useCallback(
    async (target: CountryFeature, bias: Bias) => {
      const cuisine = cuisineName(target.properties.code, target.properties.name)
      const hits = await findCuisineNearby(cuisine, bias)
      setNearby({ hits, bias })
      if (hits.length === 0) pushToast(`No ${cuisine} spots found — try the map links`)
    },
    [pushToast],
  )

  /** List real spots serving the picked cuisine — near you, or near the other city. */
  const findNearby = useCallback(
    async (as: string = searchAs) => {
      if (!pick || nearbyBusy) return
      setNearbyBusy(true)
      try {
        let bias: Bias = null
        if (as === 'me') {
          // prompts for geolocation the first time; cached (and remembered by the browser) after
          bias = myBiasRef.current ?? (await requestBias(currentUser?.homeCity ?? ''))
          myBiasRef.current = bias
        } else {
          bias = await cityBias(usersById.get(as)?.homeCity ?? '')
        }
        await runSearch(pick, bias)
      } catch {
        pushToast('Nearby search failed — try the map links', 'error')
      } finally {
        setNearbyBusy(false)
      }
    },
    [pick, nearbyBusy, searchAs, currentUser, usersById, runSearch, pushToast],
  )

  // A fresh spin searches automatically when location permission was already granted.
  useEffect(() => {
    if (!pick) return
    setSearchAs('me')
    let stale = false
    void passiveBias(currentUser?.homeCity ?? '').then(async (b) => {
      if (stale || !b?.precise) return
      myBiasRef.current = b
      setNearbyBusy(true)
      await runSearch(pick, b).catch(() => {})
      if (!stale) setNearbyBusy(false)
    })
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick])

  /** "Log this meal" from a result card — pre-fills the entry modal. */
  const logFromHit = useCallback(
    (h: PlaceHit) => {
      if (!pick) return
      setSelectedCode(pick.properties.code)
      setModal({
        countryCode: pick.properties.code,
        prefill: {
          restaurantName: h.name,
          city: nearby?.bias && !nearby.bias.precise ? nearby.bias.label : undefined,
          placeId: h.placeId,
          lat: h.lat,
          lng: h.lng,
        },
      })
      setPick(null)
      setNearby(null)
    },
    [pick, nearby, setModal, setSelectedCode],
  )

  const users = snap.users
  const otherUsers = users.filter((u) => u.id !== currentUser?.id && u.homeCity)

  return (
    <div className="absolute inset-0">
      <div
        ref={wrapRef}
        className="no-select absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
      />

      {/* hover card */}
      <div
        ref={cardRef}
        className="pointer-events-none fixed top-0 left-0 z-30 w-[300px]"
        style={{ visibility: hovered && !spinning && view === 'globe' ? 'visible' : 'hidden' }}
      >
        {hovered && <HoverCardContent feature={hovered} />}
      </div>

      {/* legend + hint */}
      <div className="pointer-events-none absolute right-5 bottom-5 z-10 hidden flex-col items-end gap-2 sm:flex">
        <div className="glass flex items-center gap-3 rounded-full px-3.5 py-1.5 text-[11px] text-muted">
          {users.map((u) => (
            <span key={u.id} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: u.color }} />
              {u.name}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: PURPLE }} />
            Together
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border" style={{ borderColor: AMBER }} />
            Queued
          </span>
        </div>
        <div className="text-[11px] text-muted/70">drag to spin · click a country · hold to queue</div>
      </div>

      {/* spin button + pick card */}
      <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3">
        <AnimatePresence>
          {pick && (
            <motion.div
              key={pick.properties.code}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className="glass w-[340px] rounded-2xl p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-semibold tracking-[0.2em] text-amber uppercase">
                    Tonight's spin
                  </div>
                  <div className="font-display mt-1 text-2xl">
                    {flagEmoji(pick.properties.code)}{' '}
                    {cuisineName(pick.properties.code, pick.properties.name)}
                    {pick.properties.rare && (
                      <span className="ml-2 align-middle text-[10px] font-sans font-semibold tracking-widest text-amber uppercase">
                        ✦ rare find
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted">{pick.properties.name} · {pick.properties.subregion}</div>
                </div>
                <button
                  className="chip"
                  onClick={() => {
                    setPick(null)
                    setNearby(null)
                  }}
                  aria-label="Dismiss"
                >
                  <Icon name="x" size={12} />
                </button>
              </div>

              {/* real spots serving this cuisine near you (asks for location once) */}
              <div className="mt-3">
                {nearby ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">
                        {cuisineName(pick.properties.code, pick.properties.name)} spots {nearby.bias?.label ?? 'nearby'}
                      </div>
                      {otherUsers.length > 0 && (
                        <div className="flex gap-1">
                          <button
                            className={`chip ${searchAs === 'me' ? 'active' : ''}`}
                            onClick={() => {
                              setSearchAs('me')
                              void findNearby('me')
                            }}
                          >
                            near me
                          </button>
                          {otherUsers.map((u) => (
                            <button
                              key={u.id}
                              className={`chip ${searchAs === u.id ? 'active' : ''}`}
                              onClick={() => {
                                setSearchAs(u.id)
                                void findNearby(u.id)
                              }}
                            >
                              {u.homeCity}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {nearbyBusy && <div className="py-1 text-xs text-muted">Searching…</div>}
                    {!nearbyBusy && nearby.hits.length === 0 && (
                      <div className="py-1 text-xs text-muted">Nothing found — try the map links below.</div>
                    )}
                    {!nearbyBusy &&
                      nearby.hits.slice(0, 5).map((h, i) => (
                        <div
                          key={`${h.name}-${i}`}
                          className="card flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{h.name}</div>
                            <div className="flex items-center gap-2 text-[11px] text-muted">
                              {h.rating != null && (
                                <span className="shrink-0">
                                  ★ {h.rating.toFixed(1)}
                                  {h.ratingCount ? ` (${h.ratingCount})` : ''}
                                </span>
                              )}
                              {nearby.bias && h.lat != null && h.lng != null && (
                                <span className="shrink-0 tabular-nums">
                                  {distanceKm(nearby.bias, { lat: h.lat, lng: h.lng }).toFixed(1)} km
                                </span>
                              )}
                              {h.locality && <span className="truncate">{h.locality}</span>}
                            </div>
                          </div>
                          <a
                            className="chip shrink-0"
                            target="_blank"
                            rel="noreferrer"
                            href={mapsUrl(`${h.name} ${h.locality}`)}
                            aria-label={`Open ${h.name} in Maps`}
                          >
                            <Icon name="external" size={11} />
                          </a>
                          <button className="chip shrink-0" onClick={() => logFromHit(h)}>
                            <Icon name="plus" size={11} /> Log
                          </button>
                        </div>
                      ))}
                  </div>
                ) : (
                  <button className="btn w-full" onClick={() => void findNearby()} disabled={nearbyBusy}>
                    <Icon name="pin" size={13} />
                    {nearbyBusy
                      ? 'Searching…'
                      : `Find ${cuisineName(pick.properties.code, pick.properties.name)} near me`}
                  </button>
                )}
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  className="btn"
                  onClick={() => {
                    void toggleWishlist(pick.properties.code)
                    setPick(null)
                    setNearby(null)
                  }}
                >
                  <Icon name="pin" size={13} /> Queue it
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setSelectedCode(pick.properties.code)
                    setModal({ countryCode: pick.properties.code })
                    setPick(null)
                    setNearby(null)
                  }}
                >
                  <Icon name="plus" size={13} /> Log a meal
                </button>
                <button className="btn" onClick={() => void spin()}>
                  <Icon name="dice" size={13} /> Again
                </button>
              </div>

              <div className="mt-2 text-[11px] text-muted">
                Maps:{' '}
                {users.map((u, i) => (
                  <span key={u.id}>
                    {i > 0 && ' · '}
                    <a
                      className="underline decoration-dotted underline-offset-2 hover:text-text"
                      target="_blank"
                      rel="noreferrer"
                      href={mapsUrl(
                        `${cuisineName(pick.properties.code, pick.properties.name)} restaurant ${u.homeCity}`,
                      )}
                    >
                      {u.homeCity || u.name}
                    </a>
                  </span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button className="btn-primary" onClick={() => void spin()} disabled={spinning}>
          <Icon name="dice" size={15} />
          {spinning ? 'Spinning…' : 'Spin for dinner'}
        </button>
      </div>
    </div>
  )
}

function HoverCardContent({ feature }: { feature: CountryFeature }) {
  const { entriesByCountry, usersById, wishlistCodes, statusByCountry, resolvePhoto } = useApp()
  const p = feature.properties
  if (!p.interactive) return null
  const entries = entriesByCountry.get(p.code) ?? []
  const tried = statusByCountry.get(p.code)
  const both = Boolean(tried && tried.size >= 2)
  const queued = wishlistCodes.has(p.code)
  const photos = entries.flatMap((e) => e.photos).slice(0, 3)
  const latestDish = entries.find((e) => e.signatureDish)?.signatureDish

  return (
    <div className="glass rounded-2xl p-3.5 shadow-2xl">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-display text-lg leading-tight">
          {flagEmoji(p.code)} {p.name}
        </div>
        {p.rare && <span className="shrink-0 text-[9px] font-semibold tracking-[0.18em] text-amber uppercase">✦ rare</span>}
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
        {p.subregion}
        {queued && (
          <span className="inline-flex items-center gap-1 text-amber">
            <Icon name="pin" size={10} /> queued
          </span>
        )}
        {both && (
          <span className="inline-flex items-center gap-1" style={{ color: PURPLE }}>
            <Icon name="heart" size={10} fill /> together
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="mt-2.5 text-xs text-muted">
          No stamps yet — <span className="text-text">click to add</span> · hold to queue
        </div>
      ) : (
        <>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {entries.slice(0, 2).map((e) => {
              const u = usersById.get(e.userId)
              return (
                <div key={e.id} className="flex items-center gap-2 text-xs">
                  {u && <Avatar user={u} size={18} />}
                  <span className="min-w-0 flex-1 truncate font-medium">{e.restaurantName}</span>
                  <Stars rating={e.rating} color={u?.color} size={9} />
                </div>
              )
            })}
            {entries.length > 2 && (
              <div className="text-[11px] text-muted">+{entries.length - 2} more — click to open</div>
            )}
          </div>
          {latestDish && <div className="font-display mt-2 text-xs text-muted italic">"{latestDish}"</div>}
          {photos.length > 0 && (
            <div className="mt-2 flex gap-1.5">
              {photos.map((ph, i) => (
                <img key={i} src={resolvePhoto(ph)} className="h-12 w-16 rounded-lg object-cover" alt="" />
              ))}
            </div>
          )}
          <div className="mt-2 text-[10px] text-muted/80">
            {plural(entries.length, 'meal')} · last {formatDate(entries[0].dateTried)}
          </div>
        </>
      )}
    </div>
  )
}
