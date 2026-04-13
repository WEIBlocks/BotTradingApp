import { pgTable, pgEnum, uuid, varchar, text, numeric, integer, timestamp, boolean, index, } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
export const exchangeMethodEnum = pgEnum("exchange_method", [
    "oauth",
    "api_key",
]);
export const exchangeStatusEnum = pgEnum("exchange_status", [
    "connected",
    "disconnected",
    "syncing",
    "error",
]);
export const assetClassEnum = pgEnum("asset_class", [
    "crypto",
    "stocks",
]);
export const exchangeConnections = pgTable("exchange_connections", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id),
    provider: varchar("provider", { length: 50 }).notNull(),
    method: exchangeMethodEnum("method"),
    apiKeyEnc: text("api_key_enc"),
    apiSecretEnc: text("api_secret_enc"),
    oauthTokenEnc: text("oauth_token_enc"),
    oauthRefreshEnc: text("oauth_refresh_enc"),
    status: exchangeStatusEnum("status").default("connected"),
    accountLabel: varchar("account_label", { length: 100 }),
    totalBalance: numeric("total_balance", { precision: 14, scale: 2 }).default("0"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    assetClass: assetClassEnum("asset_class").default("crypto"),
    sandbox: boolean("sandbox").default(false),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
    userIdIdx: index("exchange_conn_user_id_idx").on(t.userId),
}));
export const exchangeAssets = pgTable("exchange_assets", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    exchangeConnId: uuid("exchange_conn_id")
        .notNull()
        .references(() => exchangeConnections.id, { onDelete: "cascade" }),
    symbol: varchar("symbol", { length: 20 }).notNull(),
    name: varchar("name", { length: 100 }),
    amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
    valueUsd: numeric("value_usd", { precision: 14, scale: 2 }),
    change24h: numeric("change_24h", { precision: 8, scale: 4 }),
    allocation: numeric("allocation", { precision: 5, scale: 2 }),
    iconColor: varchar("icon_color", { length: 9 }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
// Daily portfolio snapshots for equity history chart
export const portfolioSnapshots = pgTable("portfolio_snapshots", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id),
    date: timestamp("date", { withTimezone: true }).notNull(),
    totalValue: numeric("total_value", { precision: 14, scale: 2 }).notNull(),
    change24h: numeric("change_24h", { precision: 14, scale: 2 }).default("0"),
    changePercent: numeric("change_percent", { precision: 8, scale: 4 }).default("0"),
    assetCount: integer("asset_count").default(0),
}, (t) => ({
    userDateIdx: index("portfolio_snapshots_user_date_idx").on(t.userId, t.date),
}));
