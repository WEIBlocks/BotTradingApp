import { db } from '../config/database.js';
import { notifications } from '../db/schema/notifications.js';
import { publishMessage } from '../config/redis.js';

export async function sendNotification(
  userId: string,
  data: {
    type: 'trade' | 'system' | 'alert';
    title: string;
    body: string;
    priority?: 'low' | 'normal' | 'high';
  },
) {
  // Insert notification record in DB
  const [notification] = await db
    .insert(notifications)
    .values({
      userId,
      type: data.type,
      title: data.title,
      body: data.body,
      priority: data.priority ?? 'normal',
    })
    .returning();

  // Publish to Redis for WebSocket delivery
  await publishMessage(`notifications:${userId}`, {
    type: 'notification',
    data: notification,
  });

  return notification;
}
