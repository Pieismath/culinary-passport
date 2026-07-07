import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store/store'
import type { Entry } from '../types'
import { PURPLE } from '../config'
import { flagEmoji, formatDate, plural } from '../lib/format'
import { Avatar } from './Avatars'
import { Stars } from './StarRating'
import { Icon } from './Icon'

export function CountryPanel() {
  const {
    geo, selectedCode, setSelectedCode, entriesByCountry, statusByCountry,
    wishlistCodes, usersById, setModal, toggleWishlist, setLightbox,
  } = useApp()

  useEffect(() => {
    if (!selectedCode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedCode(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedCode, setSelectedCode])

  const feature = selectedCode ? geo?.byCode.get(selectedCode) : null

  return (
    <AnimatePresence>
      {feature && selectedCode && (
        <motion.aside
          key={selectedCode}
          initial={{ x: 460, opacity: 0.6 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 460, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="sheet fixed top-[68px] right-3 bottom-3 z-30 flex w-[430px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-line shadow-2xl"
        >
          <PanelBody
            code={selectedCode}
            name={feature.properties.name}
            subregion={feature.properties.subregion}
            continent={feature.properties.continent}
            rare={feature.properties.rare}
            entries={entriesByCountry.get(selectedCode) ?? []}
            tried={statusByCountry.get(selectedCode)}
            queued={wishlistCodes.has(selectedCode)}
            usersById={usersById}
            onClose={() => setSelectedCode(null)}
            onAdd={() => setModal({ countryCode: selectedCode })}
            onQueue={() => void toggleWishlist(selectedCode)}
            onPhoto={(photos, index) => setLightbox({ photos, index })}
          />
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function PanelBody(props: {
  code: string
  name: string
  subregion: string
  continent: string
  rare: boolean
  entries: Entry[]
  tried: Set<string> | undefined
  queued: boolean
  usersById: Map<string, { id: string; name: string; color: string; homeCity: string }>
  onClose: () => void
  onAdd: () => void
  onQueue: () => void
  onPhoto: (photos: string[], index: number) => void
}) {
  const { code, name, entries, tried, queued, usersById } = props
  const { resolvePhoto } = useApp()
  const both = Boolean(tried && tried.size >= 2)
  const allPhotos = entries.flatMap((e) => e.photos)

  return (
    <>
      <div className="border-b border-line p-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
              {props.subregion} · {props.continent}
              {props.rare && <span className="ml-2 text-amber">✦ rare find</span>}
            </div>
            <h2 className="font-display mt-1 text-3xl leading-tight">
              {flagEmoji(code)} {name}
            </h2>
          </div>
          <button className="chip mt-1 shrink-0" onClick={props.onClose} aria-label="Close panel">
            <Icon name="x" size={13} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {[...(tried ?? [])].map((uid) => {
            const u = usersById.get(uid)
            if (!u) return null
            return (
              <span key={uid} className="chip cursor-default" style={{ color: u.color, borderColor: `${u.color}55` }}>
                <Avatar user={u} size={15} /> {u.name} was here
              </span>
            )
          })}
          {both && (
            <span className="chip cursor-default" style={{ color: PURPLE, borderColor: `${PURPLE}55` }}>
              <Icon name="heart" size={11} fill /> together
            </span>
          )}
          {!tried?.size && <span className="chip cursor-default">untasted</span>}
        </div>

        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1" onClick={props.onAdd}>
            <Icon name="plus" size={14} /> Add a meal
          </button>
          <button className="btn" onClick={props.onQueue} style={queued ? { color: '#c98a2e', borderColor: '#c98a2e66' } : undefined}>
            <Icon name="pin" size={13} /> {queued ? 'Queued' : 'Queue'}
          </button>
        </div>
      </div>

      {allPhotos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-line p-4">
          {allPhotos.map((p, i) => (
            <img
              key={i}
              src={resolvePhoto(p)}
              className="h-20 w-28 shrink-0 cursor-pointer rounded-lg object-cover transition hover:opacity-80"
              onClick={() => props.onPhoto(allPhotos, i)}
              alt=""
            />
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5">
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center">
            <div className="font-display text-lg text-muted italic">No stamps here yet</div>
            <p className="mt-1 text-xs text-muted">
              Find a {name} spot, order the signature dish, report back.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="text-[10px] font-semibold tracking-[0.18em] text-muted uppercase">
              {plural(entries.length, 'meal')}
            </div>
            {entries.map((e) => (
              <EntryCard key={e.id} entry={e} onPhoto={props.onPhoto} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function EntryCard({ entry, onPhoto }: { entry: Entry; onPhoto: (photos: string[], index: number) => void }) {
  const { usersById, currentUser, setModal, deleteEntry, resolvePhoto } = useApp()
  const [confirming, setConfirming] = useState(false)
  const u = usersById.get(entry.userId)
  const mine = currentUser?.id === entry.userId

  return (
    <div className="card rounded-xl p-4">
      <div className="flex items-center gap-2.5">
        {u && <Avatar user={u} size={22} />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{entry.restaurantName}</div>
          <div className="text-[11px] text-muted">
            {entry.city && `${entry.city} · `}
            {formatDate(entry.dateTried)}
          </div>
        </div>
        <Stars rating={entry.rating} color={u?.color} size={11} />
      </div>

      {entry.signatureDish && (
        <div className="font-display mt-2.5 text-[13px] italic">"{entry.signatureDish}"</div>
      )}
      {entry.notes && <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{entry.notes}</p>}

      {entry.photos.length > 0 && (
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto">
          {entry.photos.map((p, i) => (
            <img
              key={i}
              src={resolvePhoto(p)}
              className="h-16 w-20 shrink-0 cursor-pointer rounded-md object-cover transition hover:opacity-80"
              onClick={() => onPhoto(entry.photos, i)}
              alt=""
            />
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span
          className="inline-flex items-center gap-1 text-[11px]"
          style={{ color: entry.wouldReturn ? '#2f9e63' : 'var(--color-muted)' }}
        >
          <Icon name={entry.wouldReturn ? 'check' : 'x'} size={11} />
          {entry.wouldReturn ? 'would go back' : 'one and done'}
        </span>
        {mine && (
          <div className="flex items-center gap-1">
            {confirming ? (
              <>
                <span className="mr-1 text-[11px] text-muted">delete?</span>
                <button className="chip" style={{ color: '#c0392b' }} onClick={() => void deleteEntry(entry.id)}>
                  yes
                </button>
                <button className="chip" onClick={() => setConfirming(false)}>
                  no
                </button>
              </>
            ) : (
              <>
                <button
                  className="chip"
                  onClick={() => setModal({ countryCode: entry.countryCode, entry })}
                  aria-label="Edit entry"
                >
                  <Icon name="pencil" size={12} />
                </button>
                <button className="chip" onClick={() => setConfirming(true)} aria-label="Delete entry">
                  <Icon name="trash" size={12} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
