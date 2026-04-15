import { pgTable, pgEnum, uuid, varchar, text, numeric, timestamp, boolean, index, } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { bots, botSubscriptions } from "./bots.js";
export const positionSideEnum = pgEnum("position_side", ["long", "short"]);
export const positionStatusEnum = pgEnum("position_status", [
    "open",
    "closed",
    "stopped",
]);
export const botPositions = pgTable("bot_positions", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id),
    botId: uuid("bot_id")
        .notNull()
        .references(() => bots.id),
    subscriptionId: uuid("subscription_id").references(() => botSubscriptions.id),
    shadowSessionId: uuid("shadow_session_id"),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    side: positionSideEnum("side").notNull(),
    entryPrice: numeric("entry_price", { precision: 18, scale: 8 }).notNull(),
    exitPrice: numeric("exit_price", { precision: 18, scale: 8 }),
    amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
    entryValue: numeric("entry_value", { precision: 14, scale: 2 }),
    exitValue: numeric("exit_value", { precision: 14, scale: 2 }),
    pnl: numeric("pnl", { precision: 12, scale: 2 }),
    pnlPercent: numeric("pnl_percent", { precision: 8, scale: 4 }),
    stopLoss: numeric("stop_loss", { precision: 18, scale: 8 }),
    takeProfit: numeric("take_profit", { precision: 18, scale: 8 }),
    status: positionStatusEnum("status").default("open"),
    isPaper: boolean("is_paper").default(true),
    entryReasoning: text("entry_reasoning"),
    exitReasoning: text("exit_reasoning"),
    entryTradeId: uuid("entry_trade_id"),
    exitTradeId: uuid("exit_trade_id"),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
}, (t) => ({
    userBotIdx: index("positions_user_bot_idx").on(t.userId, t.botId),
    statusIdx: index("positions_status_idx").on(t.status),
    botSymbolIdx: index("positions_bot_symbol_idx").on(t.botId, t.symbol, t.status),
}));
