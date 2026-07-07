import type { User } from '../types'
import { hexToRgba } from '../lib/format'

export function Avatar({ user, size = 22 }: { user: User; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.44,
        color: user.color,
        background: hexToRgba(user.color, 0.16),
        border: `1.5px solid ${hexToRgba(user.color, 0.65)}`,
      }}
      title={user.name}
    >
      {user.name.charAt(0).toUpperCase()}
    </span>
  )
}

export function AvatarStack({ users, size = 22 }: { users: User[]; size?: number }) {
  return (
    <span className="inline-flex items-center">
      {users.map((u, i) => (
        <span key={u.id} style={{ marginLeft: i === 0 ? 0 : -size * 0.3, zIndex: users.length - i }} className="relative inline-flex">
          <Avatar user={u} size={size} />
        </span>
      ))}
    </span>
  )
}
