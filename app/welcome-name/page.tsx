'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, Loader2, AlertCircle } from 'lucide-react'
import { AuthProvider, ProtectedRoute, useAuth } from 'lyzr-architect-pg/client'
import { Toaster, toast } from 'sonner'

function WelcomeNameContent() {
  const router = useRouter()
  const { user, authFetch, refreshUser } = useAuth()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardChecked, setGuardChecked] = useState(false)

  useEffect(() => {
    if (user?.name) {
      router.replace('/dashboard')
      return
    }
    setGuardChecked(true)
  }, [user, router])

  const trimmed = name.trim()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!trimmed) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await authFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || "We couldn't save your name. Please try again.")
        toast.error(data.error || "We couldn't save your name.")
        setSubmitting(false)
        return
      }
      await refreshUser()
      toast.success('Welcome to OutLoud!')
      router.replace('/dashboard')
    } catch (err: any) {
      setError("We couldn't save your name. Please try again.")
      toast.error(err?.message || 'Network error')
      setSubmitting(false)
    }
  }

  if (!guardChecked) {
    return (
      <div className="bg-background min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="bg-background text-foreground min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-[440px] bg-card rounded-2xl border border-border shadow-sm p-6 md:p-10 flex flex-col gap-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center text-primary">
            <Mic className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-semibold text-primary text-balance">What&apos;s your name?</h1>
          <p className="text-sm text-muted-foreground max-w-[26rem] text-pretty">
            We&apos;ll use this to personalise your dashboard and practice sessions.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label htmlFor="name" className="text-sm font-medium text-muted-foreground">
            Your name
          </label>
          <input
            id="name"
            type="text"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alex Morgan"
            className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />

          {error && (
            <div className="flex items-center gap-2 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!trimmed || submitting}
            className="mt-2 w-full bg-primary text-primary-foreground text-sm font-medium py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Continue
          </button>
        </form>
      </div>
    </div>
  )
}

export default function WelcomeNamePage() {
  return (
    <AuthProvider>
      <Toaster richColors position="top-right" />
      <ProtectedRoute
        unauthenticatedFallback={
          <div className="min-h-screen flex items-center justify-center bg-background">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        }
      >
        <WelcomeNameContent />
      </ProtectedRoute>
    </AuthProvider>
  )
}
