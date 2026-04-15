import { pgTable, uuid, text, integer, real, timestamp, boolean, jsonb, index, unique, } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
import { bots } from "./bots.js";
// Creator engagement metrics - daily snapshots
export const creatorAnalytics = pgTable("creator_analytics", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    creatorId: uuid("creator_id")
        .notNull()
        .references(() => users.id),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    activeSubscribers: integer("active_subscribers").default(0),
    newSubscribers: integer("new_subscribers").default(0),
    churnedSubscribers: integer("churned_subscribers").default(0),
    totalRevenue: real("total_revenue").default(0),
    avgUserProfit: real("avg_user_profit").default(0),
    topUserProfit: real("top_user_profit").default(0),
    botViews: integer("bot_views").default(0),
    botPurchases: integer("bot_purchases").default(0),
    arenaParticipations: integer("arena_participations").default(0),
    arenaWins: integer("arena_wins").default(0),
}, (t) => ({
    creatorDateIdx: index("creator_analytics_creator_date_idx").on(t.creatorId, t.date),
}));
// A/B test experiments
export const botExperiments = pgTable("bot_experiments", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    creatorId: uuid("creator_id")
        .notNull()
        .references(() => users.id),
    botId: uuid("bot_id")
        .notNull()
        .references(() => bots.id),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("draft"), // draft, running, completed, cancelled
    variantAVersionId: uuid("variant_a_version_id"),
    variantBVersionId: uuid("variant_b_version_id"),
    variantAConfig: jsonb("variant_a_config"), // strategy overrides
    variantBConfig: jsonb("variant_b_config"),
    variantASubscribers: integer("variant_a_subscribers").default(0),
    variantBSubscribers: integer("variant_b_subscribers").default(0),
    variantARevenue: real("variant_a_revenue").default(0),
    variantBRevenue: real("variant_b_revenue").default(0),
    variantAReturn: real("variant_a_return").default(0),
    variantBReturn: real("variant_b_return").default(0),
    variantAChurn: real("variant_a_churn").default(0),
    variantBChurn: real("variant_b_churn").default(0),
    winnerVariant: text("winner_variant"), // 'A', 'B', null
    confidence: real("confidence").default(0),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
}, (t) => ({
    creatorIdx: index("bot_experiments_creator_idx").on(t.creatorId),
    botIdx: index("bot_experiments_bot_idx").on(t.botId),
}));
// User profitability per bot
export const userBotProfitability = pgTable("user_bot_profitability", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id),
    botId: uuid("bot_id")
        .notNull()
        .references(() => bots.id),
    creatorId: uuid("creator_id")
        .notNull()
        .references(() => users.id),
    totalProfit: real("total_profit").default(0),
    totalTrades: integer("total_trades").default(0),
    winRate: real("win_rate").default(0),
    subscriptionDays: integer("subscription_days").default(0),
    isActive: boolean("is_active").default(true),
    lastTradeAt: timestamp("last_trade_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
}, (t) => ({
    creatorIdx: index("user_bot_profitability_creator_idx").on(t.creatorId),
    userBotUnique: unique("user_bot_profitability_user_bot_unique").on(t.userId, t.botId),
}));
// Bot pattern analysis results
export const botPatternAnalysis = pgTable("bot_pattern_analysis", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    botId: uuid("bot_id")
        .notNull()
        .references(() => bots.id),
    analysisDate: timestamp("analysis_date", { withTimezone: true })
        .notNull()
        .defaultNow(),
    detectedPatterns: jsonb("detected_patterns"), // [{pattern: 'momentum', confidence: 0.85, description: '...'}]
    marketCorrelation: jsonb("market_correlation"), // {btc: 0.7, eth: 0.3, sp500: 0.1}
    bestConditions: text("best_conditions"), // 'trending bullish markets'
    worstConditions: text("worst_conditions"), // 'sideways markets'
    riskScore: real("risk_score").default(0),
    consistencyScore: real("consistency_score").default(0),
    sharpeRatio: real("sharpe_ratio").default(0),
    maxDrawdown: real("max_drawdown").default(0),
    suggestedImprovements: jsonb("suggested_improvements"), // AI-generated suggestions
}, (t) => ({
    botIdx: index("bot_pattern_analysis_bot_idx").on(t.botId),
}));
