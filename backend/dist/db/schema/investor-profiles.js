import { pgTable, pgEnum, uuid, varchar, integer, timestamp, } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
export const riskLevelEnum = pgEnum("risk_level", [
    "conservative",
    "moderate",
    "aggressive",
]);
export const investorProfiles = pgTable("investor_profiles", {
    id: uuid("id")
        .primaryKey()
        .default(sql `gen_random_uuid()`),
    userId: uuid("user_id")
        .notNull()
        .unique()
        .references(() => users.id, { onDelete: "cascade" }),
    riskTolerance: integer("risk_tolerance").notNull().default(50),
    riskLevel: riskLevelEnum("risk_level").default("moderate"),
    investmentGoal: varchar("investment_goal", { length: 100 }),
    timeHorizon: varchar("time_horizon", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
