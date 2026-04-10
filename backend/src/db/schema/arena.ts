import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { bots } from "./bots";

export const arenaStatusEnum = pgEnum("arena_status", [
  "setup",
  "running",
  "completed",
]);

export const arenaModeEnum = pgEnum("arena_mode", [
  "shadow",
  "live",
]);

export const arenaSessions = pgTable(
  "arena_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: arenaStatusEnum("status").default("setup"),
    mode: arenaModeEnum("mode").default("shadow"),
    durationSeconds: integer("duration_seconds").default(180),
    // Shared balance pool — all bots compete within this total pool
    virtualBalance: numeric("virtual_balance", { precision: 14, scale: 2 }).default("10000"),
    // For mixed (crypto+stock) sessions, store balances separately
    cryptoBalance: numeric("crypto_balance", { precision: 14, scale: 2 }),
    stockBalance: numeric("stock_balance", { precision: 14, scale: 2 }),
    // Session type flags
    hasCrypto: boolean("has_crypto").default(false),
    hasStocks: boolean("has_stocks").default(false),
    isMixed: boolean("is_mixed").default(false),
    // Per-bot allocation = virtualBalance / botCount (computed at start)
    perBotAllocation: numeric("per_bot_allocation", { precision: 14, scale: 2 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    notificationSent: boolean("notification_sent").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userStatusIdx: index("arena_user_status_idx").on(t.userId, t.status),
  })
);

export const arenaGladiators = pgTable(
  "arena_gladiators",
  {
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
    totalTrades: integer("total_trades").default(0),
    totalPnl: numeric("total_pnl", { precision: 12, scale: 2 }).default("0"),
    equityData: jsonb("equity_data"),
    decisionLog: jsonb("decision_log"),
    isWinner: boolean("is_winner").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    sessionIdx: index("arena_gladiator_session_idx").on(t.sessionId),
  })
);
