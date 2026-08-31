'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { AuthProvider, ProtectedRoute, useAuth } from 'lyzr-architect-pg/client'
import { Toaster, toast } from 'sonner'

const TOTAL_QUESTIONS = 3

type Answer = { question: string; transcript: string; feedback: unknown }

function collectAnswers(): Answer[] {
  const answers: Answer[] = []
  for (let q = 1; q <= TOTAL_QUESTIONS; q++) {
    const feedbackRaw = sessionStorage.getItem(`outloud_feedback_${q}`)
    if (!feedbackRaw) continue
    const question = sessionStorage.getItem(`outloud_question_${q}`) ?? 'Tell me about your response.'
    const transcript = sessionStorage.getItem(`outloud_transcript_${q}`) ?? ''
    try {
      const feedback = JSON.parse(feedbackRaw)
      answers.push({ question, transcript, feedback })
    } catch {
      // Skip malformed entries rather than failing the whole session save.
    }
  }
  return answers
}

function SessionCompleteContent() {
  const router = useRouter()
  const { authFetch } = useAuth()
  const persistedRef = useRef(false)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [saving, setSaving] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (persistedRef.current) return
    persistedRef.current = true

    const answers = collectAnswers()
    setAnsweredCount(answers.length)

    if (answers.length === 0) {
      setSaving(false)
      return
    }

    authFetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) {
          setSaveError(data.error || 'Failed to save your session')
          toast.error(data.error || 'Failed to save your session')
          return
        }
        for (let q = 1; q <= TOTAL_QUESTIONS; q++) {
          sessionStorage.removeItem(`outloud_feedback_${q}`)
          sessionStorage.removeItem(`outloud_transcript_${q}`)
          sessionStorage.removeItem(`outloud_transcript_unsupported_${q}`)
          sessionStorage.removeItem(`outloud_question_${q}`)
        }
        toast.success('Session saved to your history')
      })
      .catch((err) => {
        setSaveError(err?.message || 'Network error')
        toast.error(err?.message || 'Network error')
      })
      .finally(() => setSaving(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="bg-background text-foreground antialiased min-h-screen flex items-center justify-center p-4 md:p-8">
      <main className="w-full max-w-[540px] bg-card rounded-2xl border border-border shadow-sm p-6 md:p-10 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2">
        <header className="flex flex-col items-center text-center gap-2">
          <div className="w-16 h-16 rounded-full bg-secondary/30 flex items-center justify-center mb-1">
            <CheckCircle2 className="w-8 h-8 text-secondary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground text-balance">Practice complete! 🎉</h1>
          <p className="text-base text-muted-foreground max-w-sm text-pretty">
            Great job stepping into the studio today. Here is a summary of your session.
          </p>
        </header>

        <section className="flex flex-col gap-4 border-t border-border pt-6">
          <div className="flex items-center justify-center gap-4 p-4 bg-muted rounded-lg border border-border">
            {saving ? (
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            ) : (
              <span className="font-serif text-3xl text-primary tabular-nums">{answeredCount}</span>
            )}
            <span className="text-sm text-muted-foreground">of {TOTAL_QUESTIONS} questions answered with feedback</span>
          </div>
          {saveError && <p className="text-xs text-destructive text-center">{saveError} — your local feedback is preserved for this session.</p>}
          <p className="text-sm text-muted-foreground text-center">
            Your feedback for each question is saved to your history — review it anytime from the dashboard.
          </p>
        </section>

        <footer className="flex flex-col gap-3 mt-1">
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full bg-primary text-primary-foreground text-sm font-medium py-3 px-4 rounded-lg hover:bg-primary/90 transition-colors active:scale-[0.98]"
          >
            Done
          </button>
          <button
            onClick={() => router.push('/returning')}
            className="w-full bg-card border border-border text-primary text-sm font-medium py-3 px-4 rounded-lg hover:bg-muted transition-colors"
          >
            View History
          </button>
        </footer>
      </main>
    </div>
  )
}

export default function SessionCompletePage() {
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
        <SessionCompleteContent />
      </ProtectedRoute>
    </AuthProvider>
  )
}
