import { pgTable, uuid, text, varchar, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { bots } from './bots.js';

// Note: pgvector extension must be enabled on the database
// We store embeddings as JSONB arrays since drizzle doesn't natively support vector type
// The actual similarity search will use raw SQL with pgvector

export const knowledgeEmbeddings = pgTable('knowledge_embeddings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  botId: uuid('bot_id').references(() => bots.id, { onDelete: 'cascade' }),
  sourceType: varchar('source_type', { length: 30 }).notNull(), // 'image', 'video', 'document', 'youtube', 'text', 'chat'
  sourceId: varchar('source_id', { length: 255 }), // reference to training_uploads.id or youtube URL
  content: text('content').notNull(), // the text chunk
  summary: text('summary'), // AI-generated summary of this chunk
  embedding: jsonb('embedding'), // vector as JSON array (will use raw SQL for pgvector ops)
  embeddingModel: varchar('embedding_model', { length: 64 }).default('gemini-text-embedding-004'), // tracks which model generated this embedding
  metadata: jsonb('metadata'), // extra info: filename, youtube title, timestamp, etc.
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userAiSettings = pgTable('user_ai_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  preferredModel: varchar('preferred_model', { length: 50 }).default('auto'),
  systemPromptOverride: text('system_prompt_override'),
  temperature: integer('temperature'), // stored as int (0-100), divided by 100 when used
  maxTokens: integer('max_tokens').default(2048),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
