import { eq, and, desc, count } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { notifications, notificationSettings } from '../../db/schema/notifications.js';
import { NotFoundError } from '../../lib/errors.js';
import { paginate, paginatedResponse, type PaginationParams } from '../../lib/pagination.js';

export async function getNotifications(userId: string, page: number, limit: number) {
  const params: PaginationParams = { page, limit };
  const { limit: take, offset } = paginate(params);

  const [totalResult] = await db
    .select({ count: count() })
    .from(notifications)
    .where(eq(notifications.userId, userId));

  const total = totalResult?.count ?? 0;

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(take)
    .offset(offset);

  return paginatedResponse(rows, total, params);
}

export async function markAsRead(userId: string, notificationId: string) {
  const [updated] = await db
    .update(notifications)
    .set({ read: true })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
      ),
    )
    .returning();

  if (!updated) {
    throw new NotFoundError('Notification');
  }

  return updated;
}

export async function markAllAsRead(userId: string) {
  await db
    .update(notifications)
    .set({ read: true })
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.read, false),
      ),
    );

  return { success: true };
}

export async function getSettings(userId: string) {
  const [settings] = await db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1);

  if (settings) return settings;

  // Upsert default settings
  const [created] = await db
    .insert(notificationSettings)
    .values({ userId })
    .returning();

  return created;
}

export async function updateSettings(
  userId: string,
  data: {
    tradeAlerts?: boolean;
    systemUpdates?: boolean;
    priceAlerts?: boolean;
    pushEnabled?: boolean;
    emailEnabled?: boolean;
  },
) {
  // Ensure settings exist
  await getSettings(userId);

  const [updated] = await db
    .update(notificationSettings)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(notificationSettings.userId, userId))
    .returning();

  return updated;
}
