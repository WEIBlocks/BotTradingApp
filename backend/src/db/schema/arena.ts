import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { bots } from "./bots";

export const arenaStatusEnum = pgEnum("arena_status", [
  "setup",
  "running",
  "completed",
]);

export const arenaSessions = pgTable("arena_sessions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  status: arenaStatusEnum("status").default("setup"),
  durationSeconds: integer("duration_seconds").default(180),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const arenaGladiators = pgTable("arena_gladiators", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => arenaSessions.id, { onDelete: "cascade" }),
  botId: uuid("bot_id")
    .notNull()
    .references(() => bots.id),
  rank: integer("rank"),
  finalReturn: numeric("final_return", { precision: 8, scale: 4 }),
  winRate: numeric("win_rate", { precision: 5, scale: 2 }),
  equityData: jsonb("equity_data"),
  isWinner: boolean("is_winner").default(false),
});
