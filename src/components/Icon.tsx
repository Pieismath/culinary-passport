type IconName =
  | 'plus' | 'x' | 'trash' | 'pencil' | 'star' | 'dice' | 'pin' | 'check'
  | 'chevron' | 'camera' | 'heart' | 'external' | 'globe' | 'book' | 'clock' | 'sparkle'

const PATHS: Record<IconName, string> = {
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-9 0l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13',
  pencil: 'M4 20l4-1L19.5 7.5a2.1 2.1 0 00-3-3L5 16l-1 4z',
  star: 'M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2-5.6-3.2L6.4 20l1.3-6.2L3 9.5l6.3-.7L12 3z',
  dice: 'M4 8l8-4 8 4v8l-8 4-8-4V8zm8-4v8m0 0l8-4m-8 4L4 8',
  pin: 'M12 21s-6.5-5.5-6.5-10.2A6.5 6.5 0 0112 4.5a6.5 6.5 0 016.5 6.3C18.5 15.5 12 21 12 21zm0-8.5a2 2 0 100-4 2 2 0 000 4z',
  check: 'M5 13l4 4L19 7',
  chevron: 'M6 9l6 6 6-6',
  camera: 'M4 8h3l2-2h6l2 2h3v11H4V8zm8 8.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  heart: 'M12 20s-7-4.5-9-9c-1.3-3 1-7 4.5-7C10 4 12 6.5 12 6.5S14 4 16.5 4C20 4 22.3 8 21 11c-2 4.5-9 9-9 9z',
  external: 'M14 4h6v6m0-6L10 14M9 5H5v14h14v-4',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zm-9 9h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z',
  book: 'M5 4h6a2 2 0 012 2v14a2 2 0 00-2-2H5V4zm14 0h-6a2 2 0 00-2 2v14a2 2 0 012-2h6V4z',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 4v5l3.5 2',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zm7 11l.9 2.6L22.5 18l-2.6.9L19 21.5l-.9-2.6L15.5 18l2.6-1.4L19 14z',
}

export function Icon({
  name,
  size = 16,
  className = '',
  fill = false,
}: {
  name: IconName
  size?: number
  className?: string
  fill?: boolean
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={fill ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
