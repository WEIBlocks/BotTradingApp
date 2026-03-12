import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  numeric,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const paymentMethodTypeEnum = pgEnum("payment_method_type", [
  "card",
  "crypto",
]);

export const paymentTypeEnum = pgEnum("payment_type", [
  "bot_purchase",
  "subscription",
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
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  type: paymentMethodTypeEnum("type"),
  stripePmId: varchar("stripe_pm_id", { length: 255 }),
  label: varchar("label", { length: 50 }),
  last4: varchar("last4", { length: 10 }),
  network: varchar("network", { length: 30 }),
  cryptoAddress: varchar("crypto_address", { length: 255 }),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  type: paymentTypeEnum("type"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("USD"),
  stripePaymentId: varchar("stripe_payment_id", { length: 255 }),
  status: paymentStatusEnum("status").default("pending"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
