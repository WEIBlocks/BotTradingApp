import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

export const planTierEnum = pgEnum("plan_tier", ["free", "pro"]);
export const planPeriodEnum = pgEnum("plan_period", ["monthly", "yearly"]);

export const userSubStatusEnum = pgEnum("user_sub_status", [
  "active",
  "cancelled",
  "past_due",
  "trialing",
  "expired",
]);

/** Platform the subscription was purchased on */
export const iapPlatformEnum = pgEnum("iap_platform", ["android", "ios", "none"]);

export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 50 }).notNull(),
  tier: planTierEnum("tier").default("free"),
  /** Google Play product ID (e.g. tradingapp_pro_monthly) */
  googleProductId: varchar("google_product_id", { length: 255 }),
  /** Apple App Store product ID */
  appleProductId: varchar("apple_product_id", { length: 255 }),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  period: planPeriodEnum("period"),
  features: text("features").array(),
  discountPercent: numeric("discount_percent", {
    precision: 5,
    scale: 2,
  }).default("0"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const userSubscriptions = pgTable("user_subscriptions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  planId: uuid("plan_id")
    .notNull()
    .references(() => subscriptionPlans.id),
  status: userSubStatusEnum("status").default("active"),
  platform: iapPlatformEnum("platform").default("none"),
  /** Google Play / App Store purchase token for renewal verification */
  purchaseToken: varchar("purchase_token", { length: 2048 }),
  /** Store-assigned order/transaction ID */
  orderId: varchar("order_id", { length: 255 }),
  /** Latest verified product ID (matches store) */
  productId: varchar("product_id", { length: 255 }),
  currentPeriodStart: timestamp("current_period_start", {
    withTimezone: true,
  }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
