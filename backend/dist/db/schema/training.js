import { pgTable, pgEnum, uuid, varchar, text, integer, numeric, timestamp, jsonb, } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { bots } from "./bots";
export const uploadTypeEnum = pgEnum("upload_type", [
    "image",
    "video",
    "document",
]);
export const uploadStatusEnum = pgEnum("upload_status", [
    "pending",
    "processing",
    "complete",
    "error",
]);
export const activityTypeEnum = pgEnum("activity_type", [
    "purchase",
    "withdrawal",
    "profit",
    "deposit",
    "fee",
]);
export const trainingUploads = pgTable("training_uploads", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id),
    botId: uuid("bot_id").references(() => bots.id),
    type: uploadTypeEnum("type"),
    name: varchar("name", { length: 255 }).notNull(),
    fileUrl: text("file_url").notNull(),
    fileSize: integer("file_size"),
    status: uploadStatusEnum("status").default("pending"),
    analysisResult: jsonb("analysis_result"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const activityLog = pgTable("activity_log", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id),
    type: activityTypeEnum("type"),
    title: varchar("title", { length: 200 }),
    subtitle: varchar("subtitle", { length: 200 }),
    amount: numeric("amount", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
