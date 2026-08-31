import type { TranscriptionError, TranscriptionProvider, TranscriptionResult } from './types'

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

/**
 * Default provider. Carries over the donor's exact Android hardening:
 * continuous/interimResults, auto-restart on `onend` with a 250ms delay
 * (avoids InvalidStateError), suppression of transient onend/onerror (only
 * not-allowed / service-not-allowed surface), a lastSeenTranscriptRef-style
 * snapshot, and the three-way final fallback. None of that logic is
 * rewritten here -- it is relocated behind the TranscriptionProvider
 * interface unchanged.
 */
export function createWebSpeechProvider(): TranscriptionProvider {
  let recognition: SpeechRecognitionLike | null = null
  let isRecording = false
  let finalTranscript = ''
  let lastSeenTranscript = ''
  let partialCb: ((text: string) => void) | null = null
  let errorCb: ((e: TranscriptionError) => void) | null = null

  const isSupported = () => !!getSpeechRecognitionCtor()

  return {
    id: 'web-speech',
    isSupported,
    supportsLivePartials: () => true,
    start(_stream: MediaStream) {
      finalTranscript = ''
      lastSeenTranscript = ''
      isRecording = true

      const Ctor = getSpeechRecognitionCtor()
      if (!Ctor) return

      const rec = new Ctor()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-US'
      rec.onresult = (event: any) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) {
            finalTranscript += result[0].transcript + ' '
          } else {
            interim += result[0].transcript
          }
        }
        const combined = (finalTranscript + interim).trim()
        lastSeenTranscript = combined
        partialCb?.(combined)
      }
      rec.onerror = (event: any) => {
        // Transient errors (dropped connection, brief silence, engine hiccups) are
        // common on Android and are auto-recovered by the onend restart below --
        // don't surface them as a failure. Only a genuine permission problem is
        // worth telling the user.
        if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
          errorCb?.({ message: 'Microphone access is required for speech-to-text.', fatal: true })
        }
      }
      rec.onend = () => {
        // Android's speech engine frequently ends recognition on its own (network
        // blip, brief silence, OS audio focus changes) even while continuous=true.
        // Treat this as transient and restart automatically as long as the user is
        // still recording, instead of surfacing an error or losing the transcript
        // captured so far.
        if (isRecording) {
          // A restart called synchronously inside onend can throw InvalidStateError
          // on some Android browsers because the previous session hasn't fully
          // released yet; a short delay makes the restart reliable.
          setTimeout(() => {
            if (!isRecording) return
            try {
              rec.start()
            } catch {
              // ignore restart failures; already-captured transcript is preserved
            }
          }, 250)
        }
      }
      recognition = rec
      try {
        rec.start()
      } catch {
        errorCb?.({ message: "Speech recognition couldn't start.", fatal: false })
      }
    },
    stop(): Promise<TranscriptionResult> {
      isRecording = false
      if (recognition) {
        try {
          recognition.stop()
        } catch {
          // ignore
        }
      }
      // Fall back to the live transcript (which includes not-yet-finalized interim
      // speech), then to the last onresult snapshot, if recognition was cut off
      // before Android finalized a result -- otherwise a captured-but-uncommitted
      // response would be discarded entirely.
      const finalText = finalTranscript.trim() || lastSeenTranscript.trim()
      return Promise.resolve({
        text: finalText,
        source: 'web-speech',
        confidence: finalTranscript.trim() ? 'final' : finalText ? 'interim-salvage' : 'unavailable',
      })
    },
    onPartial(cb) {
      partialCb = cb
    },
    onError(cb) {
      errorCb = cb
    },
  }
}

export const webSpeechProvider = createWebSpeechProvider
