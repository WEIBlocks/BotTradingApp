import { pgTable, pgEnum, uuid, varchar, text, boolean, timestamp, } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";
export const ticketStatusEnum = pgEnum("ticket_status", [
    "open",
    "in_progress",
    "resolved",
    "closed",
]);
export const ticketPriorityEnum = pgEnum("ticket_priority", [
    "low",
    "normal",
    "high",
    "critical",
]);
export const ticketTypeEnum = pgEnum("ticket_type", [
    "support",
    "bug_report",
    "feature_request",
]);
export const supportTickets = pgTable("support_tickets", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    type: ticketTypeEnum("type").default("support").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    status: ticketStatusEnum("status").default("open").notNull(),
    priority: ticketPriorityEnum("priority").default("normal").notNull(),
    category: varchar("category", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const ticketMessages = pgTable("ticket_messages", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    ticketId: uuid("ticket_id")
        .notNull()
        .references(() => supportTickets.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    isAdmin: boolean("is_admin").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
