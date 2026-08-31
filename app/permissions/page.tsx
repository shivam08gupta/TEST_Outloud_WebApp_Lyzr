'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Video, Mic, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react'
import { AuthProvider, ProtectedRoute } from 'lyzr-architect-pg/client'
import { Toaster } from 'sonner'

type Mode = 'av' | 'audio'

function PermissionsContent() {
  const router = useRouter()
  const [requesting, setRequesting] = useState<Mode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deniedMode, setDeniedMode] = useState<Mode | null>(null)

  const requestAccess = async (mode: Mode) => {
    setError(null)
    setRequesting(mode)

    if (!navigator.mediaDevices?.getUserMedia) {
      setRequesting(null)
      setError("This browser doesn't support camera or microphone access. Please try a modern browser like Chrome.")
      return
    }

    try {
      const constraints: MediaStreamConstraints = mode === 'av' ? { video: true, audio: true } : { audio: true }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      stream.getTracks().forEach((track) => track.stop())
      router.push(`/practice?q=1&media=${mode}`)
    } catch (err) {
      setRequesting(null)
      setDeniedMode(mode)
      const name = (err as { name?: string })?.name
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError(
          mode === 'av'
            ? 'Camera and microphone access was denied. You can try again or continue with microphone only.'
            : 'Microphone access was denied. Please allow microphone access in your browser to continue.'
        )
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError("We couldn't find a camera or microphone on this device.")
      } else {
        setError("We couldn't access your camera or microphone. Please try again.")
      }
    }
  }

  return (
    <div className="bg-background text-foreground antialiased min-h-screen flex items-center justify-center p-4 md:p-6 overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-muted to-background opacity-60 z-0" />

      <main className="relative z-10 w-full max-w-[600px] mx-auto">
        <div className="bg-card border border-border rounded-2xl p-6 md:p-10 shadow-sm flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-center gap-1 mb-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Video className="w-8 h-8 text-primary" />
            </div>
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center -ml-4 border-2 border-card relative z-10">
              <Mic className="w-8 h-8 text-secondary-foreground fill-current" />
            </div>
          </div>

          <h1 className="text-2xl font-semibold text-foreground mb-2 text-balance">
            Let&apos;s make this feel like a real scenario
          </h1>
          <p className="text-base text-muted-foreground mb-6 max-w-md text-pretty">
            OutLoud uses your microphone so you can answer questions naturally. Your camera creates a more realistic interview environment, like practising in front of a mirror.
          </p>

          <div className="w-full bg-secondary/20 rounded-lg p-4 mb-6 flex items-start gap-3 text-left border border-secondary/40 shadow-sm">
            <div className="w-9 h-9 rounded-full bg-card flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-secondary-foreground" strokeWidth={2} />
            </div>
            <div>
              <p className="text-sm text-foreground leading-relaxed">
                <strong className="font-bold">Privacy first.</strong> We don&apos;t analyse your appearance, eye contact, body language, or emotions.
              </p>
            </div>
          </div>

          {error && (
            <div className="w-full bg-destructive/10 text-destructive rounded-lg p-3 mb-4 flex items-start gap-2 text-left border border-destructive/30">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed">{error}</p>
            </div>
          )}

          <div className="w-full flex flex-col gap-3">
            <button
              onClick={() => requestAccess('av')}
              disabled={requesting !== null}
              className="w-full bg-primary text-primary-foreground text-sm font-medium py-3 px-4 rounded-lg hover:bg-primary/90 transition-colors duration-200 flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {requesting === 'av' && <Loader2 className="w-4 h-4 animate-spin" />}
              {deniedMode === 'av' && error ? 'Try Again: Allow Camera & Microphone' : 'Allow Camera & Microphone'}
            </button>
            <button
              onClick={() => requestAccess('audio')}
              disabled={requesting !== null}
              className="w-full bg-card text-primary border border-border text-sm font-medium py-3 px-4 rounded-lg hover:bg-muted transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {requesting === 'audio' && <Loader2 className="w-4 h-4 animate-spin" />}
              Use Microphone Only
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

export default function PermissionsPage() {
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
        <PermissionsContent />
      </ProtectedRoute>
    </AuthProvider>
  )
}
