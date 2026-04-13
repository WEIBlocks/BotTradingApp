import { pgTable, pgEnum, uuid, numeric, timestamp, boolean, index, unique, } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { bots } from "./bots";
export const copyStatusEnum = pgEnum("copy_status", [
    "active",
    "paused",
    "stopped",
]);
export const copyTradingSessions = pgTable("copy_trading_sessions", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    followerId: uuid("follower_id")
        .notNull()
        .references(() => users.id),
    leaderId: uuid("leader_id")
        .notNull()
        .references(() => users.id),
    botId: uuid("bot_id")
        .notNull()
        .references(() => bots.id),
    status: copyStatusEnum("status").default("active"),
    allocationPercent: numeric("allocation_percent", { precision: 5, scale: 2 }).default("100"),
    maxTradeSize: numeric("max_trade_size", { precision: 14, scale: 2 }),
    totalCopiedTrades: numeric("total_copied_trades").default("0"),
    totalPnl: numeric("total_pnl", { precision: 12, scale: 2 }).default("0"),
    isPaper: boolean("is_paper").default(true),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
    followerLeaderUnique: unique("copy_follower_leader_unique").on(t.followerId, t.botId),
    followerIdx: index("copy_follower_idx").on(t.followerId),
    leaderIdx: index("copy_leader_idx").on(t.leaderId),
}));
