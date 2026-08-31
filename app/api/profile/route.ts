import { authMiddleware, getSql } from 'lyzr-architect-pg'
import { NextRequest, NextResponse } from 'next/server'

// lyzr-architect-pg does not ship an update-profile handler out of the box —
// `handleMe` is read-only. This route runs a scoped raw update against the
// package's own `_users` table (never a second users table) to set `name`
// for the currently authenticated user only.
export const PUT = authMiddleware(async (req: NextRequest & { userId?: string }) => {
  try {
    const body = await req.json()
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 })
    }
    const userId = (req as any).userId
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }
    const sql = getSql()
    const rows = await sql`
      update _users set name = ${name}, updated_at = now()
      where id = ${userId}
      returning id, email, name
    `
    const row = rows?.[0]
    if (!row) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: { id: row.id, email: row.email, name: row.name } })
  } catch (err: any) {
    console.error('[API] PUT /api/profile error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 400 })
  }
})
