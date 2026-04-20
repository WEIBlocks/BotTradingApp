import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users.js";

export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant"]);

export const conversations = pgTable("conversations", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: chatRoleEnum("role").notNull(),
  content: text("content").notNull(),
  conversationId: uuid("conversation_id")
    .notNull()
    .default(sql`gen_random_uuid()`),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
