import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const notificationTypeEnum = pgEnum("notification_type", [
  "trade",
  "system",
  "alert",
]);

export const notificationPriorityEnum = pgEnum("notification_priority", [
  "low",
  "normal",
  "high",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: notificationTypeEnum("type"),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    priority: notificationPriorityEnum("priority").default("normal"),
    read: boolean("read").default(false),
    tradeId: uuid("trade_id"),
    chartData: jsonb("chart_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    userIdIdx: index("notifications_user_id_idx").on(t.userId),
  })
);

export const notificationSettings = pgTable("notification_settings", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  tradeAlerts: boolean("trade_alerts").default(true),
  systemUpdates: boolean("system_updates").default(true),
  priceAlerts: boolean("price_alerts").default(true),
  pushEnabled: boolean("push_enabled").default(true),
  emailEnabled: boolean("email_enabled").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
