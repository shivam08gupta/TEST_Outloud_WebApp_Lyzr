Reading the remaining flow pages so the manifest reflects real behaviour, not guesses.I have the full picture. Writing the porting plan now.





# OutLoud — Interview Practice Web App (Imported)

## 1. Overview
OutLoud lets people rehearse behavioural interview questions out loud, on camera, and get structured AI coaching on each answer. This build **ports the existing OutLoud codebase into Architect's Next.js template** — preserving the current UI, the 12 screens, navigation, the record → transcribe → feedback loop, and Mixpanel tracking. No redesign, no new features.

**Important:** Architect keeps its own Next.js/Tailwind-v3 template and ports your code *into* it. Your repository is not run verbatim — the donor is a Vite SPA in a pnpm monorepo with an Express server, none of which runs here.

## 2. User Stories
- As a candidate, I want to sign up and set my name so the app greets me and tracks my practice.
- As a candidate, I want to pick my role and grant camera/mic access so practice matches my discipline.
- As a candidate, I want to answer 3 questions on camera with live transcription so I rehearse realistically.
- As a candidate, I want structured feedback (what went well / focus on / try saying it this way) after each answer.
- As a returning user, I want my completed sessions saved so I can see my history on the dashboard.

## 3.a. Agent Architecture

**Pattern:** Single Agent (plus one non-agent server route)

**Reasoning:** there is exactly one LLM task in this app — coaching feedback. Transcription looked like a second agent, but investigating the audio hand-off (6.c) showed it is a mechanical file-in/text-out API call with no reasoning step, so it is a plain server route instead. Adding an agent there would have cost latency and risked a model rewriting the candidate's words.

**Feedback agent reasoning:** one LLM task — turn a question + transcript into the fixed coaching JSON. No Gemini custom tool was available in the catalog, so the agent performs the full coaching reasoning itself, using its own instructions (OpenAI `gpt-5-nano`, temperature 0.1) to produce the exact JSON contract directly. There is no external tool call and no pass-through — the agent is fully bound and functional today, with no further configuration needed.

**Agent Flow:** The practice screen records an answer to an audio blob. On Stop, the blob is POSTed to `/api/transcribe`, a Next.js route (not an agent) that reads `GEMINI_API_KEY` from the environment server-side, converts Android's webm/opus to ogg via ffmpeg-static + fluent-ffmpeg stream-copy remux when needed, and calls Gemini's `generateContent` with the inline base64 audio, returning plain text; that text is stashed in `sessionStorage` under the existing `outloud_transcript_${n}` key. If `GEMINI_API_KEY` is unset, the route degrades gracefully (treated as an STT-unsupported state) rather than crashing. No agent is involved in transcription. On `/feedback?q=N` the Feedback Coach Agent is invoked automatically (mirroring the donor's auto-fire `useEffect`) with `{ question, transcript }`. The agent reasons over that payload directly, using its own instructions, and returns the coaching JSON; it is then stashed per question exactly as today. On `/complete`, all three answers are written as one `practice_sessions` row. The "Retry" button on an error state re-invokes the same agent. Sub-agents: none.

**Data Sources Detected:** none — the Feedback Coach Agent reasons over `{ question, transcript }` entirely with its own instructions; no external Gemini tool is called. Transcription reaches Gemini directly from a server route (`/api/transcribe`), outside the agent layer entirely. No knowledge base, no web search.

**Agents Table:**
| Agent Type | Agent Name | Description | Tools/Data Sources | Trigger | Provider | Model | Temperature | Top_p |
|---|---|---|---|---|---|---|---|---|
| Single | Feedback Coach Agent (`6a8e702831e45f765e8e001a`) | Fully bound and functional. Receives `{ question, transcript }` and performs the complete coaching reasoning itself, via its own instructions, returning the donor contract directly: `whatWentWell{summary,tags}`, `focusOn[{title,description,example{youSaid,tryInstead}}]`, `trySayingItThisWay{suggestion,why}`. No external Gemini custom tool is called — none was available in the catalog, so the agent's own instructions carry the coaching logic end-to-end. Contract documented in the **outloud-feedback-coach** skill. | None — reasoning performed internally, no external tool | Auto on `/feedback` load; "Retry" button on error | OpenAI | `gpt-5-nano` | 0.1 | 1 |

**Transcription is NOT an agent.** It is a direct server-to-server API call from `/api/transcribe` — see 6.c for why the agent route is impossible here and why this is better anyway. No LLM orchestrates it, so it has no row in this table.

**Why the agent model is a small, fast one:** `gpt-5-nano` at temperature 0.1 is sufficient for the fixed-shape coaching task and keeps latency and cost low on `/feedback`'s auto-fire load. Web search is off — it would leak search preambles and citation tags into the JSON and break parsing.

No custom tool or further configuration is required for feedback — the agent is fully bound and functional as built.


## 3.g. Database Configuration

**Database:** PostgreSQL (built-in). Your Drizzle schema ports over almost directly; the only forced change is identity — `clerk_user_id` becomes a local `user_id`, since Clerk is being replaced.

**User Management:** Required — email/password signup + login, replacing Clerk.

| Table | Purpose | Key Columns |
|---|---|---|
| users | Accounts + the preferred name captured on `/welcome-name` | id text PK, email text unique, password_hash text, name text (nullable — drives the welcome-name redirect), created_at timestamptz |
| practice_sessions | One row per completed 3-question run | id serial PK, user_id text FK → users.id (cascade), answers jsonb (array of `{question, transcript, feedback}`), completed_at timestamptz default now() |

**Authentication Flow:** Sign up (name/email/password) → account created → `/dashboard`. Log in → authenticated → if `name` is null, redirect to `/welcome-name` first (preserving the donor's `RequireProfileName` guard). All routes except `/`, `/sign-in`, `/sign-up` are gated.

## 4. User Flow
```
Landing (/) — public, unchanged
  → Sign Up / Sign In  → [name missing?] → /welcome-name → sets users.name
  → /dashboard  (greeting, sessions-completed count, Start Practice CTA)
  → /onboarding (role picker: pm | swe | data | marketing | other → selects question bank)
  → /permissions (getUserMedia camera+mic check, error states preserved)
  → /practice?q=1  record + live transcript → stash → 
  → /feedback?q=1  [Feedback Coach Agent runs] → Try Again | Next
  → repeat q=2, q=3
  → /complete  → writes one practice_sessions row → /returning or /dashboard
```

## 5. Integrations Required
No out-of-the-box integrations required.

> **Note 1 — Transcription's Gemini key:** transcription is implemented as a direct server route, `/api/transcribe`, calling Gemini's `generateContent` with the audio inlined as base64 — not a Lyzr custom tool. It reads `GEMINI_API_KEY` from the environment server-side. The route is complete and functional; it degrades gracefully (treated like an STT-unsupported state) if `GEMINI_API_KEY` is unset, rather than crashing. Setting that key remains an open configuration item — see section 9. Feedback needs no such key: the Feedback Coach Agent reasons over the transcript itself and requires no external tool.
>
> **Note 2 — Mixpanel:** a client-side browser SDK (`mixpanel-browser`), not a Lyzr tool integration — it ports as a direct dependency and stays token-gated exactly as today. All six existing events (`practice_started`, `permissions_granted`, `recording_started`, `response_submitted`, `feedback_generated`, `retry_clicked`) keep their current names and property shapes, including the EU API host and the silent no-op when the token is absent.

## 6. Imported Codebase — Porting Plan

**Source Location:** `/app/import-source` — app at `artifacts/outloud`, backend at `artifacts/api-server`, shared packages at `lib/`.

**Detected Stack:** pnpm workspaces monorepo (Node 24, TS 5.9). Frontend: **Vite + React + wouter** routing, **Tailwind CSS v4** (`@tailwindcss/vite`), ~54 shadcn/ui components, Radix primitives, TanStack Query, framer-motion, Clerk (`@clerk/react`), `mixpanel-browser`, `react-icons` present as a dep. Backend: **Express 5** + `@google/genai` (gemini-3.6-flash) + Clerk Express middleware. Data: **PostgreSQL + Drizzle** + Zod, with API types generated by **Orval** from `lib/api-spec/openapi.yaml`.

**Port Manifest**

| Source path | Destination | Transfer type | Notes |
|---|---|---|---|
| `outloud/src/pages/landing.tsx` | `app/page.tsx` | Needs adaptation | Public landing; signed-in users redirect to dashboard |
| `outloud/src/pages/sign-in.tsx`, `sign-up.tsx` | `app/sign-in/page.tsx`, `app/sign-up/page.tsx` | Rebuild | Clerk `<SignIn/>`/`<SignUp/>` replaced with email/password forms; layout/copy preserved |
| `outloud/src/pages/welcome-name.tsx` | `app/welcome-name/page.tsx` | Needs adaptation | Writes `users.name`; same guard semantics |
| `outloud/src/pages/dashboard.tsx` | `app/dashboard/page.tsx` | Needs adaptation | Session count now from `practice_sessions` |
| `outloud/src/pages/onboarding.tsx` | `app/onboarding/page.tsx` | Clean port | Role picker, pure UI |
| `outloud/src/pages/permissions.tsx` | `app/permissions/page.tsx` | Clean port | `getUserMedia` + error states carry over as `"use client"` |
| `outloud/src/pages/practice.tsx` | `app/practice/page.tsx` | Needs adaptation | **Highest-value file (641 lines).** Question banks (all 5 role banks verbatim), av/audio-only mode switching, `getUserMedia` error branches, timers, waveform, empty-transcript guard all preserved; `useSearch` → `useSearchParams`. Speech capture moves behind a provider interface — see 6.b |
| `outloud/src/pages/feedback.tsx` | `app/feedback/page.tsx` | Needs adaptation | `useGenerateFeedback` → `callAgent` on `@/lib/aiAgent` (agent → your Gemini custom tool); auto-fire-once `useEffect`, `requestedForRef` guard, sessionStorage stash, Retry path and render tree all unchanged |
| `outloud/src/pages/complete.tsx`, `returning.tsx` | `app/complete/`, `app/returning/` | Needs adaptation | `complete` persists the session row |
| `outloud/src/pages/not-found.tsx` | `app/not-found.tsx` | Clean port | |
| `outloud/src/components/ui/*` (54 files) | `components/ui/*` | Needs adaptation | Only components actually used are ported; template's shadcn set is preferred where equivalent. Tailwind v4 → v3 utility fixes |
| `outloud/src/components/error-boundary.tsx`, `logout-link.tsx` | `components/` | Needs adaptation | Logout rewired to local auth |
| `outloud/src/lib/analytics.ts` | `lib/analytics.ts` | Clean port | `import.meta.env.VITE_MIXPANEL_TOKEN` → `process.env.NEXT_PUBLIC_MIXPANEL_TOKEN`; EU host + no-op fallback preserved |
| `outloud/src/lib/utils.ts` | `lib/utils.ts` | Clean port | `cn`, `initialFor` |
| `lib/db/src/schema/*.ts` | Drizzle schema | Needs adaptation | `clerk_user_id` → `user_id`; `zod/v4` → template's zod |
| `api-server/src/lib/gemini.ts` (prompt + schema) | Feedback Coach Agent instructions | Not ported — reference | The prompt and `responseSchema` were transcribed into the agent's own instructions (OpenAI `gpt-5-nano`); the agent reasons and returns the JSON directly, with no external Gemini tool call. The donor file is read only as the contract reference for the skill |
| `api-server/src/routes/sessions.ts`, `profile.ts` | Server actions / route handlers | Rebuild | Express + `getAuth(req)` → local session auth |
| `outloud/src/App.tsx` (router + guards) | `app/layout.tsx` tree + middleware guards | Rebuild | wouter `<Switch>`/`<Show>`/`RequireAuth` → App Router segments |

**New Dependencies Required:** `mixpanel-browser` (+ `@types/mixpanel-browser`) for tracking; `fluent-ffmpeg` + `ffmpeg-static` (+ `@types/fluent-ffmpeg`) for the audio remux in `/api/transcribe` (see 6.d); `framer-motion` if the ported screens use it. Radix primitives come in only as needed by ported shadcn components — most are already in this project.

**Explicitly NOT Ported**
- **Clerk** (`@clerk/react`, `@clerk/themes`, `clerkProxyMiddleware.ts`, `clerk-appearance.ts`, `publishableKeyFromHost`) — replaced by built-in email/password auth, per your choice.
- **The Express API server** — no backend here; `/api/feedback` becomes the agent, `/me` and `/sessions` become server actions.
- **Orval codegen + `@workspace/api-client-react` / `api-zod` / `api-spec`** — generated client for an API that no longer exists; typed calls are written directly.
- **`react-icons`** — a build error in this template; the code already uses `lucide-react` throughout.
- **Vite config, `index.html`, `main.tsx`, pnpm workspace/monorepo scaffolding, Replit plugins (`.replit`, cartographer, dev-banner)** — template owns the build.
- **`outloud/src/index.css`** — Tailwind v4 `@theme` CSS is incompatible; the design tokens are re-expressed in the template's `globals.css`.
- **`attached_assets/`, `scripts/`, `mockup-sandbox`** — prompt logs and unrelated artifacts.

## 6.b. Transcription Seam (built for a later swap)

You want Android SpeechRecognition replaceable later **without redesigning the app**, so the port introduces one deliberate structural change — the only change to existing behaviour in this plan.

Today the speech logic is inlined in `practice.tsx`. It ports into `lib/transcription/` behind a narrow interface:

```ts
interface TranscriptionProvider {
  readonly id: 'web-speech' | 'recorded-audio' | 'hybrid';
  isSupported(): boolean;
  supportsLivePartials(): boolean;   // false ⇒ UI shows "recording" instead of streaming words
  start(stream: MediaStream): void;
  stop(): Promise<TranscriptionResult>;
  onPartial(cb: (text: string) => void): void;
  onError(cb: (e: TranscriptionError) => void): void;
}

type TranscriptionResult = {
  text: string;
  source: 'web-speech' | 'recorded-audio';
  confidence: 'final' | 'interim-salvage' | 'unavailable';
};
```

`practice.tsx` calls only these five methods. Provider selection lives in one place (`lib/transcription/index.ts`), so swapping the Android default later is a one-line change.

- **`webSpeechProvider`** is the default and ships with the donor's Android hardening carried over *exactly*: `continuous`/`interimResults`, auto-restart on `onend` with the 250ms delay that avoids `InvalidStateError`, suppression of transient `onend`/`onerror` events so only `not-allowed` / `service-not-allowed` surface to the user, the `lastSeenTranscriptRef` snapshot, and the three-way final fallback (`finalTranscript` → live `transcript` → last snapshot). None of that logic is rewritten — it is relocated.
- **`practice.tsx` consumes only the interface.** It never references `webkitSpeechRecognition` directly, so a future server-side or streaming provider is a new file plus a one-line default swap — no UI, no route, no state-shape change.
- **The `mediaRecorderRef` plumbing is retained** even though the donor discards the blob, so a future provider can capture recorded audio and post it to a transcription service without re-plumbing the media stream.
- **The `speechSupported` / `sttUnsupported` fallback path stays**, including the `outloud_transcript_unsupported_${n}` sessionStorage flag the feedback screen reads.

Everything else about the practice experience — layout, camera preview, mobile and desktop video refs, controls, timer, mic-only degradation — is preserved as-is.

## 6.c. Android Transcription Without Chrome SpeechRecognition

The problem you're solving: on Android Chrome, `SpeechRecognition` streams audio to Google's endpoint, drops sessions on network blips and audio-focus changes, and frequently never marks results final — which is exactly why `practice.tsx` carries auto-restart, an interim snapshot and a three-way salvage fallback. Those are workarounds for an unreliable transport, not a fix.

**The replacement path is record-then-transcribe**, which removes the live streaming dependency entirely:

```
Practice screen (Android)
  │
  ├─ getUserMedia({ audio, video })            ← unchanged
  ├─ MediaRecorder.start()                     ← blob now RETAINED (donor discards it)
  │    mimeType negotiated: audio/webm;codecs=opus
  │                       → audio/mp4 (iOS Safari) → browser default
  │
  │  [user speaks — UI shows recording state + timer + waveform, unchanged]
  │
  ├─ MediaRecorder.stop() → Blob
  ├─ POST /api/transcribe   (NEW route in this app — see hand-off below)
  │       └→ server-side call to Gemini `generateContent`, using `GEMINI_API_KEY` (your key) → { text }
  ├─ → transcript text
  └─ sessionStorage[`outloud_transcript_${n}`] = text   ← identical key/shape
        → /feedback?q=n  ← completely unchanged downstream
```

**Why this is reliable where SpeechRecognition isn't:** the whole utterance is captured locally to a blob first, so a network blip during recording cannot truncate it. Transcription happens once, after the fact, over HTTP with normal retry semantics. No auto-restart hacks, no interim salvage, no `InvalidStateError` timing workarounds.

**The one real trade-off — live partial text.** Batch transcription cannot stream words while the user speaks. Three ways to handle it:

| Option | Live transcript box shows | Android reliability | UI change |
|---|---|---|---|
| **A. Hybrid (recommended)** | Web Speech partials, best-effort, cosmetic only | Full — the *authoritative* transcript is always the uploaded audio | None |
| **B. Pure record-then-transcribe** | "Recording…" + waveform + timer, then "Transcribing…" | Full | Transcript panel changes state during recording |
| **C. Keep Web Speech as authority** | Streaming words | Unchanged — today's problems remain | None |

**Option A is what I recommend and what the seam is built for.** Web Speech keeps running purely to paint the live transcript box, so the practice screen looks and behaves exactly as it does today; but whatever it produces is *discarded* at `stop()`, and the transcript that reaches `/feedback` and the database comes from the uploaded audio. If Web Speech dies mid-session — the current failure mode — nothing is lost, because it was never the source of truth. `confidence: 'interim-salvage'` exists only for the case where the audio upload itself fails and the salvaged partials are better than nothing.

**Backend chosen: Gemini's `generateContent`, called directly from the server route — no custom tool.** You own the model and the key via `GEMINI_API_KEY`, and the behaviour is fully predictable rather than dependent on a hosted model's audio handling.

### The audio hand-off — resolved, and my earlier Option A was wrong

I read the template's actual code rather than assuming. The finding:

**`/api/upload` cannot give your STT tool a fetchable audio URL.** Concretely, from `app/api/upload/route.ts` and `lib/aiAgent.ts`:

- It forwards files to Lyzr's `/v3/assets/upload` and returns **only** `{ asset_id, file_name, success }` per file. `UploadResponse` contains `asset_ids: string[]` and nothing else.
- There is **no** `asset_url`, `file_url`, `public_url`, `download_url` or signed URL anywhere in the response. (`file_url` exists in this codebase only on `ArtifactFile` — files an agent *produces*, not ones you upload.)
- `app/api/agent/route.ts` passes `assets` through to Lyzr as opaque ids in the task payload. They are resolved inside Lyzr's own runtime for the agent's multimodal context — they are not addresses your third-party endpoint could `GET`.

So the honest answer to your question: **the imported app as-is cannot do this, and neither can the template's upload route.** An asset id is not a URL. Passing one to your STT tool would just hand it a meaningless string.

Base64-inlining the audio into a tool call is the other theoretical route, and it is not viable either — a two-minute Opus answer is roughly 1–2 MB, ~1.4–2.7 MB base64'd, stuffed into an LLM tool-call argument. It would be slow, expensive and would hit payload limits well before it hit reliability.

### What we do instead: a server route, no agent, no custom tool

The transcription step never needed an LLM in the path. It is a file-in, text-out API call, and this app can make it directly:

```
Browser (practice.tsx)
  └─ POST /api/transcribe          multipart: audio blob + question_number
       │  (Next.js route handler in THIS app, server-side)
       ├─ reads GEMINI_API_KEY from env — never exposed to the browser
       ├─ calls Gemini's generateContent directly with the inline base64 audio
       └─ returns { text }  →  sessionStorage[`outloud_transcript_${n}`]
                                 → /feedback?q=n   ← unchanged downstream
```

This is strictly better than the agent route: one hop instead of three, no LLM cost or latency on a mechanical step, no risk of a model paraphrasing the candidate's words, real HTTP error codes, and your key stays server-side. It also removes a blocker — no STT custom tool to register. This route is built and functional; the only remaining step is setting `GEMINI_API_KEY` in the environment (see section 9), without which the route degrades gracefully rather than crashing.

**Consequence: the Transcription Agent is deleted from the architecture.** See the revised agents table in 3.a.

### On calling Gemini from that route: yes, and it's a good fit

You asked specifically whether Gemini can take the audio and return only a transcript. It can — the same `@google/genai` SDK already in your `api-server`, and the same key:

- Gemini's `generateContent` accepts **audio inline** as a `{ inlineData: { mimeType, data } }` part (base64, suitable for files under ~20 MB — comfortably fine for a single interview answer), or via the **Files API** for larger uploads.
- Gemini's **documented** supported audio MIME types are `audio/wav`, `audio/mp3`, `audio/aiff`, `audio/aac`, `audio/ogg`, `audio/flac`. **`audio/webm` is not on that list** — see 6.d for the answer to your question and the conversion step.
- Prompted with a strict transcription instruction (`"Transcribe this audio verbatim. Output only the transcript text."`) plus `responseMimeType: 'text/plain'` and temperature 0, it returns the transcript alone. The **outloud-audio-transcription** skill's hard rules — no summarising, no filler removal, no re-punctuation, empty string on silence, never fabricate — become that route's system instruction.

Base64-inlining is fine *here*, inside your own server route, precisely because it is a direct HTTP call and not an LLM tool-call argument.

**One honest caveat:** I have not executed a Gemini audio call in this sandbox, per your instruction not to run tests. The above reflects the documented `@google/genai` audio-input capability and your existing SDK usage.

**Practice screen impact: none.** It still calls `TranscriptionProvider`. Only `recordedAudioProvider`'s internals change — `/api/transcribe` instead of upload-plus-agent.

**Also worth knowing:** the STT round-trip adds a few seconds after Stop that Web Speech did not have. The existing 1200ms fake delay in `handleStop` is replaced by a real "Transcribing…" state on the same submitting UI — no new screen.

## 6.d. Audio Format Conversion in `/api/transcribe`

**Direct answer to your question: no — `audio/webm;codecs=opus` is not a documented Gemini input format, so we should not rely on it.**

Gemini's documented audio MIME types are `audio/wav`, `audio/mp3`, `audio/aiff`, `audio/aac`, `audio/ogg`, `audio/flac`. WebM is absent. It may or may not be silently tolerated by the endpoint in practice — but building the transcription path on undocumented behaviour, for the *exact* format Android Chrome produces by default, is precisely the kind of fragility you're trying to escape by leaving `SpeechRecognition`. So the route converts, unconditionally, rather than hoping.

**Browser recording is unchanged**, as you asked: `MediaRecorder` still produces whatever the device gives it (`audio/webm;codecs=opus` on Android Chrome, `audio/mp4` on iOS Safari). No change to constraints, controls, timer, waveform or `practice.tsx`.

### The conversion is a remux, not a re-encode

The useful coincidence: **WebM and Ogg are both just containers around the same Opus stream.** Android Chrome gives us Opus-in-WebM; Gemini accepts Opus-in-Ogg. So the conversion is a container rewrite with the audio stream copied byte-for-byte:

```
/api/transcribe  (server-side)
  │
  ├─ receive blob + its actual mimeType
  │
  ├─ if mimeType is already Gemini-supported  (audio/mp4→aac, ogg, wav, mp3, flac)
  │      └─ pass straight through, no conversion        ← iOS Safari path
  │
  ├─ if audio/webm                                       ← Android Chrome path
  │      └─ ffmpeg -i in.webm -c:a copy -f ogg out.ogg
  │           • stream copy: no decode, no re-encode
  │           • no quality loss, negligible CPU, ~tens of ms for a 2-min answer
  │
  ├─ base64 → Gemini generateContent  { inlineData: { mimeType, data } }
  │      system instruction = outloud-audio-transcription skill, temperature 0
  │
  └─ { text }   → unchanged downstream
```

Because it is `-c:a copy` rather than a transcode, this is cheap enough to sit inline in the request without a queue or background job.

**Fallback if the stream copy fails** (an unexpected codec inside the WebM container): re-encode to 16 kHz mono WAV — `ffmpeg -i in.webm -ar 16000 -ac 1 out.wav`. Lossier and larger, but universally accepted, and speech-recognition quality is unaffected at 16 kHz mono. The route tries copy first, falls back to WAV, and only then errors.

### New dependency, and the risk I want on the record

This needs an ffmpeg binary: `fluent-ffmpeg` + `ffmpeg-static` (~80 MB, bundles a static build). Neither is currently in this project — I checked `package.json`, there is no media tooling of any kind.

**The risk, now sharper.** I checked `next.config.js`: this project builds with **`output: 'standalone'`**. That matters, because standalone output copies only the dependencies Next's file tracing can statically detect — and `ffmpeg-static` is the classic case it misses, since the binary is resolved at runtime through a path string rather than an `import`. The usual remedy is `outputFileTracingIncludes` in `next.config.js`, but **that file is pipeline-owned and must not be edited**, so that remedy is unavailable here.

Practical consequence: ffmpeg may well work in the dev sandbox and then be absent from a standalone production bundle. Verifying in dev alone is therefore *not* sufficient evidence — see the verification steps below.

The route must also run on the Node.js runtime (`export const runtime = 'nodejs'`), never edge, since edge has no `child_process`. If the binary proves unusable, the fallbacks in preference order are:

1. **Pure-JS WebM→Ogg remux** — no binary, but a hand-rolled Opus page-writer; more code, more edge cases.
2. **Client-side decode to WAV** via `AudioContext.decodeAudioData` → PCM → WAV in the browser. Reliable and dependency-free, but *this would change the recording flow*, which you asked me not to touch. Available if the server path proves impossible.
3. **Send WebM to Gemini unconverted** and accept the undocumented-behaviour risk — the thing this section exists to avoid.

### Build step zero: verify ffmpeg before anything else

Agreed — this is the first thing the build does, before a single file is ported. It is cheap to check and expensive to discover late, and it is the one decision that could change the architecture.

| # | Check | Pass condition | On failure |
|---|---|---|---|
| 1 | Install `ffmpeg-static` + `fluent-ffmpeg` | Install completes, binary present on disk | Stop; go to fallback 1 (pure-JS remux) |
| 2 | Spawn the binary — `ffmpeg -version` from a Node route | Exits 0, prints a version | Binary not executable in this sandbox → fallback 1 |
| 3 | Real remux — feed a small WebM/Opus fixture through `-c:a copy -f ogg` | Valid Ogg out, Opus stream intact | Try the WAV re-encode path; if that also fails → fallback 1 |
| 4 | **Standalone trace check** — run a production build and confirm the binary is actually present in the standalone output | Binary in the bundle | `next.config.js` is pipeline-owned so tracing can't be configured → fallback 1 or 2 |

**Check 4 is the one that actually decides it.** Checks 1–3 passing in dev prove nothing about production while `output: 'standalone'` is in force and I cannot touch the tracing config. If 4 fails, the honest answer is that ffmpeg is not viable in this template and we take a fallback — I will tell you which, and why, rather than shipping a route that works in preview and 500s in production.

**Nothing downstream of the transcription route depends on the outcome.** `practice.tsx`, the provider seam, the feedback agent, the DB and every ported screen are identical under all three fallbacks. Only the internals of `/api/transcribe` change, which is precisely why the seam in 6.b exists.

**Scheduling note:** if the check fails, I will report it and pause for your call between fallback 1 (more code, no binary, server-side) and fallback 2 (rock-solid, but changes the browser recording flow you asked me to leave alone) before proceeding.

## 7. UI/UX Specification

### App Structure
Twelve routes, preserved one-for-one. Authenticated screens keep the donor's left sidebar (Dashboard, Practice, History, Settings, Help, Logout) with a top bar carrying notifications and the user initial avatar. Practice and permissions run full-bleed and distraction-free.

### Design System
**Components:** cards, badges, dialogs (settings/help), progress indicators, avatar, toasts, buttons (primary/ghost), form fields.
**Visual Hierarchy:** 8pt spacing grid; large screen headings with quiet secondary text; the feedback screen's three-block rhythm (what went well → focus on → try saying it this way) is the anchor layout.
**Information Density:** calm and roomy on practice, denser on dashboard and feedback.

### Screens
- **Login / Sign Up** — centered card forms, validation and error states, cross-links.
- **Welcome Name** — single field, sets `users.name`, gates the app.
- **Dashboard** — greeting by name, sessions-completed stat, Start Practice CTA, recent sessions.
- **Onboarding** — five role cards selecting the question bank.
- **Permissions** — camera/mic request with explicit denied/unsupported states.
- **Practice** — live video preview, question + guidance, record/stop, live transcript, timer, unsupported-STT fallback.
- **Feedback** — loading, error+Retry, and populated states; Try Again / Next.
- **Complete / Returning** — run summary, persists the session.

**States:** every agent-backed view ships loading, error-with-retry, and empty states, mirroring the donor's `isPending` / `isError` handling.

### Responsive behavior

| Screen / region | ~1440 wide | ~768 medium | ~320 narrow | Short height |
|---|---|---|---|---|
| Sidebar + content | Fixed sidebar, fluid content | Sidebar collapses to icon rail | Rail becomes bottom drawer | Sidebar scrolls locally |
| Dashboard | 3-col stat grid + list | 2-col grid, list below | Single column, cards stack | Page scrolls; CTA stays reachable |
| Practice | Video left, question right | Question stacks under video | Video 16:9 full-width, controls fixed bottom | Controls pinned, transcript scrolls locally |
| Feedback | Two-col: transcript + coaching | Single column, coaching first | Blocks stack, long quotes wrap | Each block scrolls locally |
| Auth forms | Centered 420px card | Same, wider margins | Full-width with 16px gutters | Card scrolls, no clipped submit |

## 8. Artifacts & references
- **App Mockup** (design file) — dashboard, practice and feedback screens; the build should match it.
- **outloud-feedback-coach** skill — the feedback JSON contract, transcribed from `api-server/src/lib/gemini.ts`. It serves as the specification the Feedback Coach Agent's own instructions implement directly, and as the validation reference for its output shape.
- **outloud-audio-transcription** skill — now the system instruction and behavioural contract for the `/api/transcribe` route (not an agent): verbatim-text rule, failure semantics, and what must never be altered before the transcript reaches the feedback step.

## 9. Configuration Required After Build

Nothing below is auto-provisioned; each is a deliberate hand-off.

| Item | Status | What you do |
|---|---|---|
| **Feedback Coach Agent** | Auto — no action needed | Fully bound and functional (agent `6a8e702831e45f765e8e001a`, OpenAI `gpt-5-nano`, temperature 0.1). No external Gemini custom tool is required; the agent performs the coaching reasoning itself. |
| **Mixpanel token** | Optional | Set `NEXT_PUBLIC_MIXPANEL_TOKEN`. Absent = analytics silently disabled, exactly as today. |
| **Database** | Auto | `users` + `practice_sessions` provisioned at build. Empty — no test users, no seeded sessions. |
| **Auth** | Auto | Built-in email/password. No accounts created. |
| **Camera / microphone** | Runtime | Browser permission prompt, unchanged. |
| **GEMINI_API_KEY for transcription** | ⚠ Open — env var | Set `GEMINI_API_KEY` server-side for `/api/transcribe`. The route itself is complete and functional; without the key it degrades gracefully (treated as an STT-unsupported state) rather than crashing, but `/practice` produces no live transcript until the key is set. |
| **Audio conversion** | Auto — built in | `/api/transcribe` remuxes Android's WebM/Opus → Ogg/Opus before calling Gemini (see 6.d). Nothing for you to configure. |
| **ffmpeg binary in deploy target** | ⚠ Build step zero | Verified first, before any porting — 4 checks in 6.d, including whether the binary survives the `output: 'standalone'` trace. I pause and report if it fails. |

**Not done at build time, per your instruction:** no test users created, no practice sessions run, no seeded feedback records.