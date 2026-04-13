import { pgTable, pgEnum, uuid, varchar, boolean, numeric, timestamp, jsonb, } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
export const paymentTypeEnum = pgEnum("payment_type", [
    "subscription",
    "subscription_renewal",
    "deposit",
    "withdrawal",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
    "pending",
    "succeeded",
    "failed",
    "refunded",
]);
export const paymentMethods = pgTable("payment_methods", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id),
    /** "google_play" | "app_store" */
    type: varchar("type", { length: 30 }),
    label: varchar("label", { length: 50 }),
    isDefault: boolean("is_default").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const payments = pgTable("payments", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id),
    type: paymentTypeEnum("type"),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).default("USD"),
    /** IAP purchase token (Google Play) or original transaction ID (App Store) */
    iapToken: varchar("iap_token", { length: 2048 }),
    status: paymentStatusEnum("status").default("pending"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
