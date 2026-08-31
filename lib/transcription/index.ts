import type { TranscriptionProvider } from './types'
import { createWebSpeechProvider } from './webSpeechProvider'

export type { TranscriptionProvider, TranscriptionResult, TranscriptionError } from './types'

// Provider selection lives in this one place. Swapping the Android default
// later (e.g. to a server-side streaming provider) is a one-line change here
// -- practice.tsx never references a concrete implementation.
export function createDefaultTranscriptionProvider(): TranscriptionProvider {
  return createWebSpeechProvider()
}
