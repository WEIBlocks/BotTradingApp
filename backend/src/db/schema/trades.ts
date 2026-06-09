import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { botSubscriptions, shadowSessions } from "./bots.js";

export const tradeSideEnum = pgEnum("trade_side", ["BUY", "SELL"]);

export const tradeStatusEnum = pgEnum("trade_status", [
  "pending",
  "filled",
  "partially_filled",
  "cancelled",
  "failed",
]);

export const trades = pgTable(
  "trades",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    botSubscriptionId: uuid("bot_subscription_id").references(
      () => botSubscriptions.id
    ),
    shadowSessionId: uuid("shadow_session_id").references(
      () => shadowSessions.id
    ),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    side: tradeSideEnum("side").notNull(),
    amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
    price: numeric("price", { precision: 18, scale: 8 }).notNull(),
    totalValue: numeric("total_value", { precision: 14, scale: 2 }),
    pnl: numeric("pnl", { precision: 12, scale: 2 }),
    pnlPercent: numeric("pnl_percent", { precision: 8, scale: 4 }),
    isPaper: boolean("is_paper").default(false),
    exchangeOrderId: varchar("exchange_order_id", { length: 255 }),
    orderType: varchar("order_type", { length: 10 }).default("market"),
    reasoning: text("reasoning"),
    status: tradeStatusEnum("status").default("filled"),
    executedAt: timestamp("executed_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userExecutedIdx: index("trades_user_executed_idx").on(
      t.userId,
      t.executedAt
    ),
    subExecutedIdx: index("trades_sub_executed_idx").on(
      t.botSubscriptionId,
      t.executedAt
    ),
  })
);
