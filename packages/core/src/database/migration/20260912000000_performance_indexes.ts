import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260912000000_performance_indexes",
  up(tx) {
    return Effect.gen(function* () {
      // ============================================
      // PERFORMANCE INDEXES — Beat OpenCode's load time
      // ============================================

      // Session listing: most common query — session by project + updated
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS idx_session_project_updated ON session(project_id, time_updated DESC)`,
      )

      // Session get by ID is PK (already fast), but add coverage for listGlobal
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS idx_session_updated_archived ON session(time_updated DESC, time_archived)`,
      )

      // Message batch loading: the critical hot path
      // Covers: WHERE session_id = ? ORDER BY time_created DESC, id DESC
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS idx_message_session_cursor ON message(session_id, time_created DESC, id DESC)`,
      )

      // Part batch loading: hydrate() uses WHERE message_id IN (...)
      // Covers: IN lookup + ordering
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS idx_part_message_lookup ON part(message_id, id)`,
      )

      // Part session-level queries (getPart uses session_id + message_id + id)
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS idx_part_session_message ON part(session_id, message_id, id)`,
      )

      // Session title search: LIKE %query% can't use B-tree, but index helps
      // for the time_updated sort that follows
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS idx_session_title_search ON session(title, time_updated DESC)`,
      )

      // Knowledge entity search: name + type lookups
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS idx_knowledge_entity_name_type ON knowledge_entity(name, entity_type)`,
      )

      // Memory search: key lookups (primary search path)
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS idx_memories_key_importance ON memories(key, importance DESC)`,
      )

      // Memory category + timestamp (for filtered recalls)
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS idx_memories_category_time ON memories(category, timestamp DESC)`,
      )

      // Conversation turns: session + turn ordering
      yield* tx.run(
        `CREATE INDEX IF NOT EXISTS idx_conversations_session_turn ON conversations(session_id, turn_index DESC)`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
