import { db } from '../config/database.js';
import { sql } from 'drizzle-orm';

// Add notification_sent column to shadow_sessions if it doesn't exist
await db.execute(sql`
  ALTER TABLE shadow_sessions
  ADD COLUMN IF NOT EXISTS notification_sent boolean NOT NULL DEFAULT false
`);
console.log('Column shadow_sessions.notification_sent ensured.');

// Mark all already-completed sessions so they don't re-fire
const result = await db.execute(sql`
  UPDATE shadow_sessions
  SET notification_sent = true
  WHERE status = 'completed'
`);
console.log('Marked', result.count, 'completed sessions as notificationSent=true');

process.exit(0);
