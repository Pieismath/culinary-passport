export function uid(): string {
  return crypto.randomUUID()
}

export function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const DATE_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const MONTH_FMT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })

function parseISO(iso: string): Date | null {
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDate(iso: string): string {
  const d = parseISO(iso)
  return d ? DATE_FMT.format(d) : iso
}

export function monthLabel(iso: string): string {
  const d = parseISO(iso)
  return d ? MONTH_FMT.format(d) : iso
}

/** ISO-3166 alpha-2 → flag emoji (white flag for pseudo-codes like XK). */
export function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/.test(code) || code === 'XK') return '🏳️'
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Deterministic small hash — used to give each passport stamp a stable tilt. */
export function seededTilt(key: string, range = 6): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return ((Math.abs(h) % (range * 2 + 1)) - range)
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
