/**
 * App database schema (PostgreSQL via Drizzle).
 *
 * Add your tables below, then run:
 *   npm run db:generate   # emits SQL migration into ./drizzle
 *   npm run db:migrate    # applies it to the app database
 *
 * Rules:
 * - Every user-owned table gets `owner_user_id: ownerUserId()` plus an index
 *   on it, and is accessed through `scopedRepo` (see lyzr-architect-pg docs).
 * - Never edit generated SQL in ./drizzle by hand.
 */
export { users } from "lyzr-architect-pg/schema";

import {
  pgTable,
  text,
  jsonb,
  timestamp,
  index,
  ownerUserId,
  generateId,
} from "lyzr-architect-pg/schema";

// One row per completed 3-question practice run. `answers` is an array of
// { question, transcript, feedback } objects captured during the flow.
export const practice_sessions = pgTable(
  "practice_sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    answers: jsonb("answers").notNull().default([]),
    completed_at: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
    owner_user_id: ownerUserId(),
  },
  (t) => [index("practice_sessions_completed_at_idx").on(t.completed_at)]
);
