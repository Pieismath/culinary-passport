import { useState } from 'react'
import { Icon } from './Icon'

export function Stars({ rating, color = '#c98a2e', size = 12 }: { rating: number; color?: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-[1px]" title={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color, opacity: i <= rating ? 1 : 0.22 }}>
          <Icon name="star" size={size} fill />
        </span>
      ))}
    </span>
  )
}

export function StarInput({ value, onChange, color = '#c98a2e' }: { value: number; onChange: (v: number) => void; color?: string }) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          className="cursor-pointer p-0.5 transition-transform hover:scale-115"
          style={{ color, opacity: i <= shown ? 1 : 0.25 }}
          onMouseEnter={() => setHover(i)}
          onClick={() => onChange(i)}
          aria-label={`${i} star${i > 1 ? 's' : ''}`}
        >
          <Icon name="star" size={22} fill />
        </button>
      ))}
    </div>
  )
}
