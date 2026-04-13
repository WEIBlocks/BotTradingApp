import { db } from '../config/database.js';
import { shadowSessions } from '../db/schema/bots.js';
import { eq } from 'drizzle-orm';
const result = await db.update(shadowSessions)
    .set({ notificationSent: true })
    .where(eq(shadowSessions.status, 'completed'))
    .returning({ id: shadowSessions.id });
console.log('Marked', result.length, 'completed shadow sessions as notificationSent=true');
process.exit(0);
