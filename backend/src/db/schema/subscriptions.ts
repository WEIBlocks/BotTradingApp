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
]);

export const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 50 }).notNull(),
  tier: planTierEnum("tier").default("free"),
  stripePriceId: varchar("stripe_price_id", { length: 255 }),
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
  stripeSubId: varchar("stripe_sub_id", { length: 255 }),
  stripeCustId: varchar("stripe_cust_id", { length: 255 }),
  status: userSubStatusEnum("status").default("active"),
  currentPeriodStart: timestamp("current_period_start", {
    withTimezone: true,
  }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
