import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
export const tradingRoomMessages = pgTable('trading_room_messages', {
    id: uuid('id').primaryKey().default(sql `gen_random_uuid()`),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    isSystemMessage: boolean('is_system_message').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
