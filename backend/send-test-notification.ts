/**
 * Send a test push notification to a user
 * Usage: npx tsx send-test-notification.ts [email]
 *
 * Prerequisites:
 * 1. Backend running (npm run dev)
 * 2. User logged into mobile app (registers FCM token automatically)
 * 3. Firebase credentials in .env.development
 */

import { db } from './src/config/database.js';
import { users } from './src/db/schema/users.js';
import { eq } from 'drizzle-orm';
import admin from 'firebase-admin';
import { env } from './src/config/env.js';

async function main() {
  const email = process.argv[2] || 'farooqtariq400@gmail.com';

  const [user] = await db.select({ email: users.email, fcm: users.fcmToken, name: users.name })
    .from(users).where(eq(users.email, email));

  if (!user) { console.log(`User ${email} not found`); process.exit(1); }

  console.log(`User: ${user.name} (${user.email})`);
  console.log(`FCM Token: ${user.fcm ? user.fcm.slice(0, 40) + '...' : 'NOT SET'}`);

  if (!user.fcm) {
    console.log('\n⚠️ No FCM token. Open the app, log in, wait 5 seconds, then run this again.');
    process.exit(0);
  }

  const app = admin.apps.length > 0 ? admin.app() : admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });

  try {
    const result = await admin.messaging().send({
      token: user.fcm,
      notification: {
        title: '🤖 BotTrade Alert',
        body: 'Your bot just made a trade! Push notifications are working with sound.',
      },
      android: {
        priority: 'high',
        notification: { sound: 'default', channelId: 'bottrade_alerts', priority: 'high' },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    });
    console.log('\n✅ Push notification SENT! Message ID:', result);
    console.log('Check your phone — you should see a notification with sound!');
  } catch (err: any) {
    console.log('\n❌ Failed:', err.code || err.message);
  }

  await app.delete();
  process.exit(0);
}

main();
