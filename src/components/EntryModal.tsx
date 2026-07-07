import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store/store'
import { flagEmoji, todayISO } from '../lib/format'
import { passiveBias, placesProvider, resolvePlace, suggestRestaurants, type Bias, type PlaceHit } from '../lib/places'
import { StarInput } from './StarRating'
import { Icon } from './Icon'

export function EntryModal() {
  const { modal } = useApp()
  return (
    <AnimatePresence>
      {modal && <ModalBody key={modal.entry?.id ?? modal.countryCode ?? 'new'} />}
    </AnimatePresence>
  )
}

function ModalBody() {
  const { modal, setModal, geo, currentUser, addEntry, updateEntry, pushToast, resolvePhoto } = useApp()
  const entry = modal?.entry
  const prefill = modal?.prefill

  const [countryCode, setCountryCode] = useState(modal?.countryCode ?? entry?.countryCode ?? '')
  const [countryQuery, setCountryQuery] = useState('')
  const [restaurantName, setRestaurantName] = useState(prefill?.restaurantName ?? entry?.restaurantName ?? '')
  const [city, setCity] = useState(prefill?.city ?? entry?.city ?? currentUser?.homeCity ?? '')
  // Google place_id + coordinates ride along when the restaurant came from autocomplete
  const [place, setPlace] = useState<{ placeId?: string; lat?: number; lng?: number }>(() =>
    prefill?.placeId || prefill?.lat != null
      ? { placeId: prefill.placeId, lat: prefill.lat, lng: prefill.lng }
      : { placeId: entry?.placeId, lat: entry?.lat, lng: entry?.lng },
  )
  const [dateTried, setDateTried] = useState(entry?.dateTried ?? todayISO())
  const [rating, setRating] = useState(entry?.rating ?? 4)
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [signatureDish, setSignatureDish] = useState(entry?.signatureDish ?? '')
  const [wouldReturn, setWouldReturn] = useState(entry?.wouldReturn ?? true)
  const [keptPhotos, setKeptPhotos] = useState<string[]>(entry?.photos ?? [])
  const [files, setFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // restaurant autocomplete (OSM by default, Google Places when a key is set)
  const [placeHits, setPlaceHits] = useState<PlaceHit[]>([])
  const [placesOpen, setPlacesOpen] = useState(false)
  const pickedRef = useRef(false)
  const biasRef = useRef<Bias>(null)

  useEffect(() => {
    void passiveBias(currentUser?.homeCity ?? '').then((b) => {
      biasRef.current = b
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (pickedRef.current) {
      pickedRef.current = false
      return
    }
    const q = restaurantName.trim()
    if (q.length < 3) {
      setPlaceHits([])
      setPlacesOpen(false)
      return
    }
    const ctl = new AbortController()
    const t = window.setTimeout(() => {
      suggestRestaurants(q, biasRef.current, ctl.signal)
        .then((hits) => {
          setPlaceHits(hits)
          setPlacesOpen(hits.length > 0)
        })
        .catch(() => {}) // aborted or offline — autocomplete is best-effort
    }, 320)
    return () => {
      window.clearTimeout(t)
      ctl.abort()
    }
  }, [restaurantName])

  const pickPlace = (hit: PlaceHit) => {
    pickedRef.current = true
    setRestaurantName(hit.name)
    if (hit.locality) setCity(hit.locality)
    setPlace({ placeId: hit.placeId, lat: hit.lat, lng: hit.lng })
    setPlacesOpen(false)
    // Google predictions carry no coordinates — resolve them (and a cleaner city) async
    if (hit.placeId && (hit.lat == null || hit.lng == null)) {
      void resolvePlace(hit).then((full) => {
        setPlace({ placeId: full.placeId, lat: full.lat, lng: full.lng })
        if (full.locality) setCity(full.locality)
      })
    }
  }

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setModal])

  const country = countryCode ? geo?.byCode.get(countryCode) : null
  const matches = useMemo(() => {
    if (!geo || country || countryQuery.trim().length < 1) return []
    const q = countryQuery.trim().toLowerCase()
    return geo.features
      .filter((f) => f.properties.interactive && f.properties.name.toLowerCase().includes(q))
      .slice(0, 6)
  }, [geo, countryQuery, country])

  const canSave = Boolean(countryCode && restaurantName.trim() && dateTried && rating >= 1 && !saving)

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    const draft = {
      countryCode,
      restaurantName: restaurantName.trim(),
      city: city.trim(),
      dateTried,
      rating,
      notes: notes.trim(),
      signatureDish: signatureDish.trim(),
      wouldReturn,
      placeId: place.placeId,
      lat: place.lat,
      lng: place.lng,
    }
    try {
      if (entry) await updateEntry(entry.id, draft, keptPhotos, files)
      else await addEntry(draft, files)
      setModal(null)
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not save', 'error')
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setModal(null)
      }}
    >
      <motion.div
        initial={{ y: 24, scale: 0.97, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 16, scale: 0.98, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="glass max-h-[88vh] w-[540px] max-w-full overflow-y-auto rounded-2xl p-6"
      >
        <div className="flex items-start justify-between">
          <h3 className="font-display text-2xl">
            {entry ? 'Edit meal' : 'Log a meal'}
            {country && (
              <span className="text-muted"> — {flagEmoji(country.properties.code)} {country.properties.name}</span>
            )}
          </h3>
          <button className="chip" onClick={() => setModal(null)} aria-label="Close">
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          {!modal?.countryCode && !entry && (
            <div className="relative col-span-2">
              <label className="label">Cuisine / country</label>
              {country ? (
                <button className="chip active" onClick={() => { setCountryCode(''); setCountryQuery('') }}>
                  {flagEmoji(country.properties.code)} {country.properties.name}
                  <Icon name="x" size={11} />
                </button>
              ) : (
                <>
                  <input
                    className="input"
                    value={countryQuery}
                    onChange={(e) => setCountryQuery(e.target.value)}
                    placeholder="Start typing… Georgia, Peru, Laos"
                    autoFocus
                  />
                  {matches.length > 0 && (
                    <div className="glass absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl">
                      {matches.map((f) => (
                        <button
                          key={f.properties.code}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/8"
                          onClick={() => setCountryCode(f.properties.code)}
                        >
                          {flagEmoji(f.properties.code)} {f.properties.name}
                          <span className="ml-auto text-[10px] text-muted">{f.properties.subregion}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="relative col-span-2">
            <label className="label">Restaurant *</label>
            <input
              className="input"
              value={restaurantName}
              onChange={(e) => {
                setRestaurantName(e.target.value)
                setPlace({}) // typed by hand — any previously picked place no longer applies
              }}
              onFocus={() => setPlacesOpen(placeHits.length > 0)}
              onBlur={() => window.setTimeout(() => setPlacesOpen(false), 150)}
              placeholder="Start typing — we'll find the spot"
            />
            {placesOpen && (
              <div className="glass absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl">
                {placeHits.map((h, i) => (
                  <button
                    key={`${h.name}-${i}`}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5"
                    onMouseDown={(e) => {
                      e.preventDefault() // keep input focus; pick before blur
                      pickPlace(h)
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{h.name}</span>
                    {h.locality && <span className="shrink-0 text-[11px] text-muted">{h.locality}</span>}
                  </button>
                ))}
                <div className="border-t border-line px-3 py-1 text-[9px] text-muted/70">
                  {placesProvider === 'google' ? 'Powered by Google' : 'search by OpenStreetMap'}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="label">City</label>
            <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Sydney / New York" />
          </div>
          <div>
            <label className="label">Date</label>
            <input className="input" type="date" value={dateTried} max={todayISO()} onChange={(e) => setDateTried(e.target.value)} />
          </div>

          <div>
            <label className="label">Rating</label>
            <StarInput value={rating} onChange={setRating} color={currentUser?.color} />
          </div>
          <div>
            <label className="label">Would you return?</label>
            <button
              type="button"
              className="chip"
              style={wouldReturn ? { color: '#2f9e63', borderColor: '#2f9e6355' } : undefined}
              onClick={() => setWouldReturn((w) => !w)}
            >
              <Icon name={wouldReturn ? 'check' : 'x'} size={12} />
              {wouldReturn ? 'In a heartbeat' : 'One and done'}
            </button>
          </div>

          <div className="col-span-2">
            <label className="label">Signature dish</label>
            <input
              className="input"
              value={signatureDish}
              onChange={(e) => setSignatureDish(e.target.value)}
              placeholder="What did you order?"
            />
          </div>

          <div className="col-span-2">
            <label className="label">Notes</label>
            <textarea
              className="input min-h-20 resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Thoughts, the vibe, what you'd order next time…"
            />
          </div>

          <div className="col-span-2">
            <label className="label">Photos</label>
            <div className="flex flex-wrap items-center gap-2">
              {keptPhotos.map((p) => (
                <Thumb key={p} src={resolvePhoto(p)} onRemove={() => setKeptPhotos((k) => k.filter((x) => x !== p))} />
              ))}
              {files.map((f, i) => (
                <Thumb key={`${f.name}-${i}`} src={previews[i]} onRemove={() => setFiles((fs) => fs.filter((_, j) => j !== i))} />
              ))}
              <button className="btn h-16 w-20 flex-col gap-1 rounded-lg text-[10px]" onClick={() => fileInputRef.current?.click()}>
                <Icon name="camera" size={16} />
                add
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  setFiles((fs) => [...fs, ...Array.from(e.target.files ?? [])])
                  e.target.value = ''
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button className="btn" onClick={() => setModal(null)}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!canSave} style={!canSave ? { opacity: 0.5 } : undefined} onClick={() => void save()}>
            {saving ? 'Stamping…' : entry ? 'Save changes' : 'Stamp it'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Thumb({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="relative">
      <img src={src} className="h-16 w-20 rounded-lg object-cover" alt="" />
      <button
        className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-white text-muted shadow-sm hover:text-text"
        onClick={onRemove}
        aria-label="Remove photo"
      >
        <Icon name="x" size={10} />
      </button>
    </div>
  )
}
