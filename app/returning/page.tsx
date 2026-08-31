'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Brain, Timer, MessageSquare, ArrowRight, ChevronRight, History, Loader2, AlertCircle } from 'lucide-react'
import { AuthProvider, ProtectedRoute, useAuth } from 'lyzr-architect-pg/client'
import { Toaster } from 'sonner'
import { AppSidebar } from '@/components/outloud/AppSidebar'
import { formatRelativeDate } from '@/lib/utils'

type FeedbackShape = { whatWentWell?: { summary?: string; tags?: string[] } }
type Answer = { question?: string; transcript?: string; feedback?: FeedbackShape }
type Session = { id: string; answers: Answer[]; completed_at: string }

function ReturningContent() {
  const router = useRouter()
  const { user, authFetch } = useAuth()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    authFetch('/api/sessions')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (!data.success) {
          setError(data.error || 'Failed to load sessions')
          return
        }
        setSessions(Array.isArray(data.data) ? data.data : [])
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Network error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authFetch])

  const sessionCount = sessions.length
  const lastSession = sessions[0]
  const name = user?.name ?? ''
  const lastFocusTag = lastSession?.answers?.[0]?.feedback?.whatWentWell?.tags?.[0]
  const subtitle = lastSession
    ? `You last practised ${formatRelativeDate(new Date(lastSession.completed_at))}. Ready to get back into practice?`
    : 'Ready for your first practice?'

  return (
    <AppSidebar active="history">
      <div className="flex-1 px-4 md:px-8 py-6 md:py-10 max-w-6xl mx-auto w-full mb-16 md:mb-0">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-semibold text-primary mb-2 text-balance">
            Welcome back{name ? `, ${name}` : ''} 👋
          </h2>
          <p className="text-base text-muted-foreground">{subtitle}</p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute -right-16 -top-16 w-64 h-64 bg-secondary/20 rounded-full blur-3xl" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 text-secondary-foreground mb-2">
                  <Brain className="w-5 h-5" />
                  <span className="text-xs font-medium uppercase tracking-wider">Today&apos;s Challenge</span>
                </div>
                <h3 className="text-xl font-semibold text-primary mb-2">Unexpected Questions</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-xl text-pretty">
                  Perfect for getting back into the flow. Practise thinking on your feet with randomized questions.
                </p>
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex items-center gap-1.5 text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
                    <Timer className="w-4 h-4" />
                    <span className="text-xs">5 min</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
                    <MessageSquare className="w-4 h-4" />
                    <span className="text-xs">3 questions</span>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/onboarding')}
                  className="bg-primary text-primary-foreground text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-primary/90 transition-colors inline-flex items-center gap-2 active:scale-[0.98]"
                >
                  Start Today&apos;s Practice
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-medium text-primary uppercase tracking-wider mb-3">Recent History</h3>
              {loading ? (
                <div className="bg-card border border-border rounded-2xl p-10 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center text-center gap-3">
                  <History className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground max-w-sm">Your practice history will appear here after your first session.</p>
                  <button
                    onClick={() => router.push('/onboarding')}
                    className="mt-1 bg-primary text-primary-foreground text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-primary/90 transition-colors active:scale-[0.98]"
                  >
                    Start Practising
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      onClick={() => router.push('/dashboard')}
                      className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:border-primary/40 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-primary">Completed session</h4>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                        {session.answers?.[0]?.question ?? `${session.answers?.length ?? 0} question${(session.answers?.length ?? 0) === 1 ? '' : 's'} practiced`}
                      </p>
                      <div className="flex justify-between items-center text-xs text-muted-foreground">
                        <span>{formatRelativeDate(new Date(session.completed_at))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-6 mt-6 lg:mt-0">
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <h3 className="text-xs font-medium text-primary uppercase tracking-wider mb-4">Your Progress</h3>
              <div className="flex flex-col gap-4">
                <div>
                  <p className="font-serif text-3xl text-primary mb-1 tabular-nums">{sessionCount}</p>
                  <p className="text-sm text-muted-foreground">sessions completed</p>
                </div>
                <div className="h-px bg-border w-full" />
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Last focus</p>
                  <p className="text-sm text-primary font-medium">{lastFocusTag ?? 'Not available yet'}</p>
                </div>
                <div className="h-px bg-border w-full" />
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Today&apos;s challenge</p>
                  <p className="text-sm text-primary font-medium">Unexpected questions</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppSidebar>
  )
}

export default function ReturningPage() {
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
        <ReturningContent />
      </ProtectedRoute>
    </AuthProvider>
  )
}
