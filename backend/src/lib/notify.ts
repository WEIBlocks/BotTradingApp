import { db } from '../config/database.js';
import { notifications } from '../db/schema/notifications.js';
import { users } from '../db/schema/users.js';
import { publishMessage } from '../config/redis.js';
import { env } from '../config/env.js';
import { eq } from 'drizzle-orm';

// ─── Firebase Admin SDK (lazy init) ─────────────────────────────────────────

let firebaseApp: any = null;

async function getFirebaseMessaging() {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_PRIVATE_KEY) return null;

  if (!firebaseApp) {
    try {
      const admin = await import('firebase-admin');
      const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

      firebaseApp = admin.default.apps.length > 0
        ? admin.default.app()
        : admin.default.initializeApp({
            credential: admin.default.credential.cert({
              projectId: env.FIREBASE_PROJECT_ID,
              clientEmail: env.FIREBASE_CLIENT_EMAIL,
              privateKey,
            }),
          });
    } catch (err) {
      console.warn('[Push] Firebase init failed:', (err as Error).message);
      return null;
    }
  }

  try {
    const admin = await import('firebase-admin');
    return admin.default.messaging();
  } catch {
    return null;
  }
}

// ─── Send Push Notification via FCM ─────────────────────────────────────────

async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  const messaging = await getFirebaseMessaging();
  if (!messaging || !fcmToken) return;

  try {
    await messaging.send({
      token: fcmToken,
      notification: {
        title,
        body,
      },
      android: {
        priority: 'high' as const,
        notification: {
          sound: 'default',
          channelId: 'bottrade_alerts',
          priority: 'high' as const,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
      data: data || {},
    });
    console.log('[Push] Notification sent successfully');
  } catch (err) {
    console.warn('[Push] Failed to send:', (err as Error).message);
  }
}

// ─── Main Notification Function ─────────────────────────────────────────────

export async function sendNotification(
  userId: string,
  data: {
    type: 'trade' | 'system' | 'alert';
    title: string;
    body: string;
    priority?: 'low' | 'normal' | 'high';
  },
) {
  // 1. Insert notification record in DB
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

  // 2. Publish to Redis for WebSocket delivery (in-app real-time)
  await publishMessage(`notifications:${userId}`, {
    type: 'notification',
    data: notification,
  });

  // 3. Send push notification via Firebase (when app is in background)
  try {
    const [user] = await db
      .select({ fcmToken: users.fcmToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user?.fcmToken) {
      await sendPushNotification(user.fcmToken, data.title, data.body, {
        type: data.type,
        notificationId: notification.id,
      });
    }
  } catch {}

  return notification;
}
