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
  unique,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const botCategoryEnum = pgEnum("bot_category", [
  "Crypto",
  "Stocks",
  "Forex",
  "Multi",
]);

export const botRiskLevelEnum = pgEnum("bot_risk_level", [
  "Very Low",
  "Low",
  "Med",
  "High",
  "Very High",
]);

export const botStatusEnum = pgEnum("bot_status", [
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "suspended",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "paused",
  "stopped",
  "shadow",
  "expired",
]);

export const subscriptionModeEnum = pgEnum("subscription_mode", [
  "live",
  "paper",
]);

export const shadowStatusEnum = pgEnum("shadow_status", [
  "running",
  "paused",
  "completed",
  "cancelled",
]);

export const bots = pgTable("bots", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id),
  name: varchar("name", { length: 100 }).notNull(),
  subtitle: varchar("subtitle", { length: 200 }),
  description: text("description"),
  prompt: text("prompt"), // AI instruction prompt that defines bot behavior
  strategy: varchar("strategy", { length: 200 }).notNull(),
  category: botCategoryEnum("category"),
  riskLevel: botRiskLevelEnum("risk_level"),
  priceMonthly: numeric("price_monthly", { precision: 10, scale: 2 }).default(
    "0"
  ),
  creatorFeePercent: numeric("creator_fee_percent", { precision: 5, scale: 2 }).default("10"),
  platformFeePercent: numeric("platform_fee_percent", { precision: 5, scale: 2 }).default("3"),
  tags: text("tags").array(),
  avatarColor: varchar("avatar_color", { length: 9 }),
  avatarLetter: varchar("avatar_letter", { length: 2 }),
  status: botStatusEnum("status").default("draft"),
  isPublished: boolean("is_published").default(false),
  config: jsonb("config"),
  version: varchar("version", { length: 20 }).default("1.0.0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const botVersions = pgTable("bot_versions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  botId: uuid("bot_id")
    .notNull()
    .references(() => bots.id),
  version: varchar("version", { length: 20 }).notNull(),
  configSnapshot: jsonb("config_snapshot"),
  isActive: boolean("is_active").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const botStatistics = pgTable("bot_statistics", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  botId: uuid("bot_id")
    .notNull()
    .unique()
    .references(() => bots.id),
  return30d: numeric("return_30d", { precision: 10, scale: 2 }),
  winRate: numeric("win_rate", { precision: 5, scale: 2 }),
  maxDrawdown: numeric("max_drawdown", { precision: 5, scale: 2 }),
  sharpeRatio: numeric("sharpe_ratio", { precision: 5, scale: 2 }),
  activeUsers: integer("active_users").default(0),
  reviewCount: integer("review_count").default(0),
  avgRating: numeric("avg_rating", { precision: 3, scale: 2 }).default("0"),
  monthlyReturns: jsonb("monthly_returns"),
  equityData: jsonb("equity_data"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const botSubscriptions = pgTable(
  "bot_subscriptions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id),
    botVersionId: uuid("bot_version_id").references(() => botVersions.id),
    status: subscriptionStatusEnum("status").default("active"),
    mode: subscriptionModeEnum("mode").default("paper"),
    allocatedAmount: numeric("allocated_amount", {
      precision: 12,
      scale: 2,
    }).default("0"),
    exchangeConnId: uuid("exchange_conn_id"),
    pair: varchar("pair", { length: 20 }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    userConfig: jsonb("user_config"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userBotUnique: unique("bot_subscriptions_user_bot_unique").on(
      t.userId,
      t.botId
    ),
    userIdIdx: index("bot_subs_user_id_idx").on(t.userId),
    botIdIdx: index("bot_subs_bot_id_idx").on(t.botId),
  })
);

export const shadowSessions = pgTable(
  "shadow_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    botId: uuid("bot_id").references(() => bots.id),
    virtualBalance: numeric("virtual_balance", {
      precision: 12,
      scale: 2,
    }).notNull(),
    currentBalance: numeric("current_balance", { precision: 12, scale: 2 }),
    durationDays: integer("duration_days").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: shadowStatusEnum("status").default("running"),
    enableRiskLimits: boolean("enable_risk_limits").default(true),
    enableRealisticFees: boolean("enable_realistic_fees").default(true),
    dailyPerformance: jsonb("daily_performance"),
    totalTrades: integer("total_trades").default(0),
    winCount: integer("win_count").default(0),
    notificationSent: boolean("notification_sent").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userStatusIdx: index("shadow_sessions_user_status_idx").on(t.userId, t.status),
  })
);

export const earningStatusEnum = pgEnum("earning_status", [
  "pending",
  "paid",
  "failed",
]);

export const creatorEarnings = pgTable("creator_earnings", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id),
  botId: uuid("bot_id")
    .notNull()
    .references(() => bots.id),
  subscriberId: uuid("subscriber_id")
    .notNull()
    .references(() => users.id),
  subscriberProfit: numeric("subscriber_profit", { precision: 12, scale: 2 }).notNull(),
  creatorFeePercent: numeric("creator_fee_percent", { precision: 5, scale: 2 }).notNull(),
  creatorEarning: numeric("creator_earning", { precision: 12, scale: 2 }).notNull(),
  platformFeePercent: numeric("platform_fee_percent", { precision: 5, scale: 2 }).notNull(),
  platformFee: numeric("platform_fee", { precision: 12, scale: 2 }).notNull(),
  status: earningStatusEnum("status").default("pending"),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    botId: uuid("bot_id")
      .notNull()
      .references(() => bots.id),
    rating: integer("rating").notNull(),
    text: text("text"),
    isVerified: boolean("is_verified").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userBotUnique: unique("reviews_user_bot_unique").on(t.userId, t.botId),
    botIdIdx: index("reviews_bot_id_idx").on(t.botId),
  })
);
