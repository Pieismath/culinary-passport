import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store/store'
import { Icon } from './Icon'
import { hexToRgba } from '../lib/format'
import { Figure3D } from './Figure3D'

export function Splash({ message = 'Loading the world…' }: { message?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5">
      <Wordmark />
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-amber"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
        />
        {message}
      </div>
    </div>
  )
}

export function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <Wordmark />
      <p className="max-w-sm text-sm text-muted">{message}</p>
      <button className="btn" onClick={() => window.location.reload()}>
        Try again
      </button>
    </div>
  )
}

function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      <span className="text-amber">
        <Icon name="globe" size={28} />
      </span>
      <span className="font-display text-3xl tracking-tight italic">Culinary Passport</span>
    </div>
  )
}

/** Local mode — pick which of the two of you is holding the phone. */
export function UserPicker() {
  const { snap, selectLocalUser } = useApp()
  const [hovered, setHovered] = useState<string | null>(null)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Wordmark />
        <p className="text-sm text-muted">One globe, two appetites. Who's tasting tonight?</p>
      </div>
      <div className="flex flex-wrap justify-center gap-6">
        {snap.users.map((u, i) => (
          <motion.button
            key={u.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            whileHover={{ y: -4 }}
            className="glass flex w-48 flex-col items-center gap-1 rounded-2xl px-6 pt-4 pb-6"
            style={{ boxShadow: `0 10px 36px ${hexToRgba(u.color, 0.18)}` }}
            onClick={() => selectLocalUser(u.id)}
            onMouseEnter={() => setHovered(u.id)}
            onMouseLeave={() => setHovered((h) => (h === u.id ? null : h))}
          >
            <Figure3D person={i === 0 ? 'jason' : 'jenn'} width={140} height={165} wave={hovered === u.id} />
            <div>
              <div className="font-display text-xl">{u.name}</div>
              <div className="text-xs text-muted">{u.homeCity}</div>
            </div>
          </motion.button>
        ))}
      </div>
      <p className="max-w-xs text-center text-[11px] leading-relaxed text-muted/70">
        Demo mode stores everything on this device. Connect Supabase (see README) for real
        two-person sync across Sydney and New York.
      </p>
    </div>
  )
}

/** Supabase mode — email + password for the two of you. */
export function SignIn() {
  const { signIn, signUp, pushToast } = useApp()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'in') {
        await signIn(email, password)
      } else {
        await signUp(email, password, name)
        pushToast('Account created — check your email if confirmation is on')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-6">
      <Wordmark />
      <form onSubmit={submit} className="glass flex w-80 flex-col gap-3 rounded-2xl p-6">
        {mode === 'up' && (
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jenn" required />
          </div>
        )}
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button className="btn-primary mt-1" disabled={busy}>
          {busy ? 'One sec…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          className="text-center text-xs text-muted hover:text-text"
          onClick={() => setMode((m) => (m === 'in' ? 'up' : 'in'))}
        >
          {mode === 'in' ? 'First time? Create an account' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
