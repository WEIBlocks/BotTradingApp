import { db } from '../../config/database.js';
import { tradingRoomMessages } from '../../db/schema/trading-room';
import { users } from '../../db/schema/users';
import { userSubscriptions } from '../../db/schema/subscriptions';
import { subscriptionPlans } from '../../db/schema/subscriptions';
import { notifications } from '../../db/schema/notifications';
import { eq, desc, lt, and, sql, count } from 'drizzle-orm';
import { ForbiddenError, NotFoundError, AppError } from '../../lib/errors.js';

// In-memory rate limit tracker: userId -> array of timestamps
const rateLimitMap = new Map<string, number[]>();

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10;

function checkRateLimit(userId: string) {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) || [];
  // Remove entries older than the window
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    throw new AppError(429, 'Rate limit exceeded. Max 10 messages per minute.', 'RATE_LIMITED');
  }
  recent.push(now);
  rateLimitMap.set(userId, recent);
}

export async function getMessages(limit: number, beforeId?: string) {
  const conditions = beforeId
    ? lt(
        tradingRoomMessages.createdAt,
        sql`(SELECT created_at FROM trading_room_messages WHERE id = ${beforeId})`,
      )
    : undefined;

  const messages = await db
    .select({
      id: tradingRoomMessages.id,
      content: tradingRoomMessages.content,
      isSystemMessage: tradingRoomMessages.isSystemMessage,
      createdAt: tradingRoomMessages.createdAt,
      userId: tradingRoomMessages.userId,
      userName: users.name,
      avatarInitials: users.avatarInitials,
      avatarColor: users.avatarColor,
    })
    .from(tradingRoomMessages)
    .innerJoin(users, eq(tradingRoomMessages.userId, users.id))
    .where(conditions)
    .orderBy(desc(tradingRoomMessages.createdAt))
    .limit(limit);

  return { data: messages };
}

export async function postMessage(userId: string, content: string) {
  // Admin bypasses subscription check
  const [currentUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!currentUser || currentUser.role !== 'admin') {
    // Check Pro subscription for non-admin users
    const activeSub = await db
      .select({ id: userSubscriptions.id })
      .from(userSubscriptions)
      .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
      .where(
        and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.status, 'active'),
          eq(subscriptionPlans.tier, 'pro'),
        ),
      )
      .limit(1);

    if (activeSub.length === 0) {
      throw new ForbiddenError('Pro subscription required to post in the trading room');
    }
  }

  // Rate limit check
  checkRateLimit(userId);

  const [message] = await db
    .insert(tradingRoomMessages)
    .values({ userId, content })
    .returning();

  // Fetch user info for the response
  const [user] = await db
    .select({
      name: users.name,
      avatarInitials: users.avatarInitials,
      avatarColor: users.avatarColor,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Notify all other Pro users about the new message
  notifyProUsers(userId, user.name || 'Someone', content).catch(() => {});

  return {
    data: {
      ...message,
      userName: user.name,
      avatarInitials: user.avatarInitials,
      avatarColor: user.avatarColor,
    },
  };
}

// Background: send notification to all Pro subscribers except sender
async function notifyProUsers(senderId: string, senderName: string, content: string) {
  // Find all active Pro subscribers + admins (excluding sender)
  const proUsers = await db
    .select({ userId: userSubscriptions.userId })
    .from(userSubscriptions)
    .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
    .where(
      and(
        eq(userSubscriptions.status, 'active'),
        eq(subscriptionPlans.tier, 'pro'),
      ),
    );

  const adminUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'));

  // Combine unique user IDs, exclude sender
  const allIds = new Set<string>();
  proUsers.forEach(u => allIds.add(u.userId));
  adminUsers.forEach(u => allIds.add(u.id));
  allIds.delete(senderId);

  if (allIds.size === 0) return;

  // Truncate message for notification preview
  const preview = content.length > 80 ? content.substring(0, 80) + '...' : content;

  // Batch insert notifications
  const rows = Array.from(allIds).map(uid => ({
    userId: uid,
    type: 'system' as const,
    title: `💬 ${senderName} in Trading Room`,
    body: preview,
    priority: 'normal' as const,
  }));

  // Insert in chunks of 50 to avoid huge queries
  for (let i = 0; i < rows.length; i += 50) {
    await db.insert(notifications).values(rows.slice(i, i + 50));
  }
}

export async function deleteMessage(userId: string, messageId: string, role?: string) {
  const [message] = await db
    .select()
    .from(tradingRoomMessages)
    .where(eq(tradingRoomMessages.id, messageId))
    .limit(1);

  if (!message) {
    throw new NotFoundError('Message');
  }

  // Only owner or admin can delete
  if (message.userId !== userId && role !== 'admin') {
    throw new ForbiddenError('You can only delete your own messages');
  }

  await db.delete(tradingRoomMessages).where(eq(tradingRoomMessages.id, messageId));

  return { data: { deleted: true } };
}

export async function getOnlineCount() {
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

  // Active posters in last 15 min
  const [result] = await db
    .select({ count: sql<number>`count(distinct ${tradingRoomMessages.userId})` })
    .from(tradingRoomMessages)
    .where(sql`${tradingRoomMessages.createdAt} >= ${fifteenMinAgo}`);

  // Total Pro subscribers (total members)
  const [totalResult] = await db
    .select({ count: count() })
    .from(userSubscriptions)
    .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
    .where(and(eq(userSubscriptions.status, 'active'), eq(subscriptionPlans.tier, 'pro')));

  const activePosters = Number(result?.count || 0);
  const online = Math.max(1, activePosters * 3);
  const totalMembers = Number(totalResult?.count || 0) + 1; // +1 for admin

  return { data: { online, totalMembers } };
}

// Get member list with online status
export async function getMembers() {
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

  // Get all pro subscribers + admins
  const members = await db
    .select({
      id: users.id,
      name: users.name,
      avatarInitials: users.avatarInitials,
      avatarColor: users.avatarColor,
      role: users.role,
    })
    .from(users)
    .where(
      sql`${users.role} = 'admin' OR ${users.id} IN (
        SELECT ${userSubscriptions.userId} FROM ${userSubscriptions}
        INNER JOIN ${subscriptionPlans} ON ${userSubscriptions.planId} = ${subscriptionPlans.id}
        WHERE ${userSubscriptions.status} = 'active' AND ${subscriptionPlans.tier} = 'pro'
      )`,
    )
    .orderBy(users.name);

  // Get recently active user IDs
  const recentActive = await db
    .select({ userId: tradingRoomMessages.userId })
    .from(tradingRoomMessages)
    .where(sql`${tradingRoomMessages.createdAt} >= ${fifteenMinAgo}`)
    .groupBy(tradingRoomMessages.userId);

  const activeIds = new Set(recentActive.map(r => r.userId));

  const membersWithStatus = members.map(m => ({
    ...m,
    isOnline: activeIds.has(m.id) || m.role === 'admin',
  }));

  // Sort: online first, then alphabetical
  membersWithStatus.sort((a, b) => {
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  return { data: membersWithStatus };
}
