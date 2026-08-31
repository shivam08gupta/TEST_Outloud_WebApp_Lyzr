import { authMiddleware, scopedRepo } from 'lyzr-architect-pg'
import { practice_sessions } from '@/lib/db/schema'
import { desc } from 'lyzr-architect-pg/schema'
import { NextRequest, NextResponse } from 'next/server'

type Answer = {
  question: string
  transcript: string
  feedback: unknown
}

export const GET = authMiddleware(async (_req: NextRequest) => {
  try {
    const rows = await scopedRepo(practice_sessions).findMany({
      orderBy: desc(practice_sessions.completed_at),
    })
    return NextResponse.json({ success: true, data: rows })
  } catch (err: any) {
    console.error('[API] GET /api/sessions error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})

export const POST = authMiddleware(async (req: NextRequest) => {
  try {
    const body = await req.json()
    const answers: Answer[] = Array.isArray(body?.answers) ? body.answers : []
    if (answers.length === 0) {
      return NextResponse.json({ success: false, error: 'answers is required' }, { status: 400 })
    }
    const [row] = await scopedRepo(practice_sessions).insert({ answers })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err: any) {
    console.error('[API] POST /api/sessions error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})
