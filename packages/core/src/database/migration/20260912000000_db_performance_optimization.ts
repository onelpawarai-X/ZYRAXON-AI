import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260912000000_db_performance_optimization",
  up(tx) {
    return Effect.gen(function* () {
      // ============================================
      // DB PERFORMANCE OPTIMIZATION — WAL + Indexes
      // ============================================

      // Compound indexes for faster message/part joins
      yield* tx.run(`CREATE INDEX IF NOT EXISTS idx_message_session_time ON message(session_id, time_created)`)
      yield* tx.run(`CREATE INDEX IF NOT EXISTS idx_part_message ON part(message_id)`)
      yield* tx.run(`CREATE INDEX IF NOT EXISTS idx_part_session_time ON part(session_id, time_created)`)

      // Event table compound indexes
      yield* tx.run(`CREATE INDEX IF NOT EXISTS idx_event_aggregate_time ON event(aggregate_id, seq)`)
      yield* tx.run(`CREATE INDEX IF NOT EXISTS idx_event_type ON event(type)`)

      // Session message compound indexes for timeline queries
      yield* tx.run(`CREATE INDEX IF NOT EXISTS idx_session_message_session_seq ON session_message(session_id, seq)`)
      yield* tx.run(`CREATE INDEX IF NOT EXISTS idx_session_message_time ON session_message(time_created)`)

      // Session lookup indexes
      yield* tx.run(`CREATE INDEX IF NOT EXISTS idx_session_time_updated ON session(time_updated DESC)`)
      yield* tx.run(`CREATE INDEX IF NOT EXISTS idx_session_project_time ON session(project_id, time_updated DESC)`)

      // Todo compound index
      yield* tx.run(`CREATE INDEX IF NOT EXISTS idx_todo_session_status ON todo(session_id, status)`)

      // Session input pending queries
      yield* tx.run(`CREATE INDEX IF NOT EXISTS idx_session_input_pending ON session_input(session_id, promoted_seq, admitted_seq)`)
    })
  },
} satisfies DatabaseMigration.Migration
