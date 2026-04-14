import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { bots, botSubscriptions } from "./bots.js";

export const decisionActionEnum = pgEnum("decision_action", [
  "BUY",
  "SELL",
  "HOLD",
]);

export const decisionModeEnum = pgEnum("decision_mode", [
  "shadow",
  "paper",
  "live",
]);

export const botDecisions = pgTable(
  "bot_decisions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    subscriptionId: uuid("subscription_id").references(
      () => botSubscriptions.id
    ),
    shadowSessionId: uuid("shadow_session_id"),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    action: decisionActionEnum("action").notNull(),
    confidence: integer("confidence").default(0),
    reasoning: text("reasoning"),
    indicators: jsonb("indicators"),
    price: numeric("price", { precision: 18, scale: 8 }).notNull(),
    aiCalled: boolean("ai_called").default(false),
    tokensCost: integer("tokens_cost").default(0),
    mode: decisionModeEnum("mode").default("paper"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    botSymbolIdx: index("bot_decisions_bot_symbol_idx").on(t.botId, t.symbol),
    userCreatedIdx: index("bot_decisions_user_created_idx").on(
      t.userId,
      t.createdAt
    ),
    botCreatedIdx: index("bot_decisions_bot_created_idx").on(
      t.botId,
      t.createdAt
    ),
  })
);
