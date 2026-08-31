// Transcription provider seam. `practice.tsx` (and only that file) talks to
// this narrow interface -- never to `webkitSpeechRecognition` or a media API
// directly -- so a future provider (server-side streaming, a different
// vendor, etc.) is a new file plus a one-line default swap in `index.ts`.

export type TranscriptionResult = {
  text: string
  source: 'web-speech' | 'recorded-audio'
  confidence: 'final' | 'interim-salvage' | 'unavailable'
}

export type TranscriptionError = {
  message: string
  fatal: boolean
}

export interface TranscriptionProvider {
  readonly id: 'web-speech' | 'recorded-audio' | 'hybrid'
  isSupported(): boolean
  supportsLivePartials(): boolean
  start(stream: MediaStream): void
  stop(): Promise<TranscriptionResult>
  onPartial(cb: (text: string) => void): void
  onError(cb: (e: TranscriptionError) => void): void
}
