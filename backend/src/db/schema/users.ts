import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["user", "creator", "admin"]);

export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: varchar("password_hash", { length: 255 }),
  name: varchar("name", { length: 100 }).notNull(),
  avatarInitials: varchar("avatar_initials", { length: 4 }),
  avatarColor: varchar("avatar_color", { length: 9 }),
  riskTolerance: integer("risk_tolerance").default(50),
  investmentGoal: varchar("investment_goal", { length: 50 }),
  referralCode: varchar("referral_code", { length: 20 }).unique(),
  referredBy: uuid("referred_by").references((): any => users.id),
  role: userRoleEnum("role").default("user"),
  googleId: varchar("google_id", { length: 255 }),
  appleId: varchar("apple_id", { length: 255 }),
  isActive: boolean("is_active").default(true),
  onboardingComplete: boolean("onboarding_complete").default(false),
  fcmToken: text("fcm_token"),
  botName: varchar("bot_name", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked: boolean("revoked").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
