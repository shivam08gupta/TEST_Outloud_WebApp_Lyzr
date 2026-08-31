import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import path from 'node:path'
import fs from 'node:fs'

// Plain server route — NOT an agent. Receives a recorded interview answer as
// a multipart audio blob, remuxes Android's WebM/Opus into Ogg/Opus when
// needed (stream copy, no re-encode), then asks Gemini to transcribe it
// verbatim. Never calls callAIAgent/Lyzr for this — this is a direct
// server-to-server call per the plan (6.c/6.d).
export const runtime = 'nodejs'

const GEMINI_SUPPORTED = new Set(['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac'])

// outloud-audio-transcription contract: verbatim transcription only.
const SYSTEM_INSTRUCTION =
  'You are a verbatim audio transcription engine. Transcribe the spoken audio exactly as spoken. ' +
  'Do not summarize, edit, add filler-word removal, re-punctuate beyond what is needed for readability, ' +
  'or editorialize in any way. Do not add commentary, labels, or notes. ' +
  'If the audio is silent or contains no discernible speech, output an empty string. ' +
  'Never fabricate words that are not present in the audio. Output only the transcript text, nothing else.'

// ffmpeg-static's own path resolver breaks once webpack inlines it into this
// route's compiled bundle (its `__dirname` collapses to route.js's own directory
// instead of ffmpeg-static's package directory — see next.config.js comment on
// outputFileTracingIncludes). process.cwd() is a runtime OS-level value, not a
// per-file lexical binding, so webpack cannot rewrite it; it resolves to the
// standalone deploy root, which is exactly where outputFileTracingIncludes ships
// the binary (node_modules/ffmpeg-static/ffmpeg relative to that same root).
function resolveFfmpegPath(): string | null {
  const candidates: (string | null)[] = [
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
  ]
  try {
    candidates.push(require('ffmpeg-static'))
  } catch {
    // ffmpeg-static's own resolver failed to load; the explicit candidate above still applies.
  }
  return candidates.find((p): p is string => !!p && fs.existsSync(p)) ?? null
}

async function remuxWebmToOgg(inputBuffer: Buffer): Promise<Buffer | null> {
  const ffmpegPath = resolveFfmpegPath()
  if (!ffmpegPath) return null

  const attempt = (args: string[]): Promise<Buffer | null> =>
    new Promise((resolve) => {
      try {
        const proc = spawn(ffmpegPath, args)
        const chunks: Buffer[] = []
        let errored = false
        proc.stdout.on('data', (c) => chunks.push(c))
        proc.on('error', () => {
          errored = true
          resolve(null)
        })
        proc.on('close', (code) => {
          if (errored) return
          if (code === 0 && chunks.length > 0) {
            resolve(Buffer.concat(chunks))
          } else {
            resolve(null)
          }
        })
        Readable.from(inputBuffer).pipe(proc.stdin)
      } catch {
        resolve(null)
      }
    })

  // Try 1: stream copy (cheap, lossless).
  const copied = await attempt(['-i', 'pipe:0', '-c:a', 'copy', '-f', 'ogg', 'pipe:1'])
  if (copied) return copied

  // Fallback: re-encode to 16kHz mono WAV.
  const wav = await attempt(['-i', 'pipe:0', '-ar', '16000', '-ac', '1', '-f', 'wav', 'pipe:1'])
  return wav
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      // Absent key is treated as an STT-unsupported-equivalent state so the
      // client's existing speechSupported / sttUnsupported fallback path
      // absorbs it gracefully instead of a hard crash.
      return NextResponse.json({ error: 'not_configured' }, { status: 200 })
    }

    const form = await req.formData()
    const file = form.get('audio')
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'audio file is required' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    let buffer: Buffer = Buffer.from(new Uint8Array(arrayBuffer))
    let mimeType = (file as File).type || 'audio/webm'

    if (mimeType.startsWith('audio/webm')) {
      const remuxed = await remuxWebmToOgg(buffer)
      if (remuxed) {
        buffer = remuxed
        mimeType = 'audio/ogg'
      }
      // If remux fails entirely, fall through and send the original webm —
      // undocumented-format risk accepted over blocking the feature (plan 6.d fallback 3).
    } else if (mimeType.includes('mp4')) {
      mimeType = 'audio/aac'
    } else if (!GEMINI_SUPPORTED.has(mimeType)) {
      // Unknown/unsupported type — still attempt, Gemini may tolerate it.
    }

    const base64Audio = buffer.toString('base64')

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: [
            {
              role: 'user',
              parts: [
                { text: 'Transcribe this audio verbatim. Output only the transcript text.' },
                { inline_data: { mime_type: mimeType, data: base64Audio } },
              ],
            },
          ],
          generationConfig: { temperature: 0, responseMimeType: 'text/plain' },
        }),
      }
    )

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => '')
      console.error('[api/transcribe] Gemini error:', geminiRes.status, errText)
      return NextResponse.json({ error: 'transcription_failed' }, { status: 502 })
    }

    const data = await geminiRes.json()
    const text: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text ?? '')
        .join('')
        ?.trim() ?? ''

    return NextResponse.json({ text })
  } catch (err: any) {
    console.error('[api/transcribe] error:', err)
    return NextResponse.json({ error: 'transcription_failed' }, { status: 500 })
  }
}
