import { db } from '../../config/database.js';
import { supportTickets, ticketMessages } from '../../db/schema/support';
import { users } from '../../db/schema/users';
import { notifications } from '../../db/schema/notifications';
import { eq, desc, and, sql } from 'drizzle-orm';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';

// Create ticket (from mobile)
export async function createTicket(
  userId: string,
  data: { type: string; title: string; description: string; category?: string },
) {
  const [ticket] = await db
    .insert(supportTickets)
    .values({
      userId,
      type: data.type as any,
      title: data.title,
      description: data.description,
      category: data.category,
    })
    .returning();

  // Also create initial message
  await db.insert(ticketMessages).values({
    ticketId: ticket.id,
    userId,
    content: data.description,
    isAdmin: false,
  });

  return ticket;
}

// List user's own tickets
export async function getUserTickets(userId: string, page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId));

  const tickets = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .orderBy(desc(supportTickets.updatedAt))
    .limit(limit)
    .offset(offset);

  return { data: tickets, pagination: { page, limit, total: count } };
}

// Get ticket messages (user or admin)
export async function getTicketMessages(
  ticketId: string,
  requestUserId: string,
  role?: string,
) {
  // Verify access
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1);

  if (!ticket) throw new NotFoundError('Ticket');
  if (ticket.userId !== requestUserId && role !== 'admin')
    throw new ForbiddenError('Access denied');

  const messages = await db
    .select({
      id: ticketMessages.id,
      ticketId: ticketMessages.ticketId,
      userId: ticketMessages.userId,
      content: ticketMessages.content,
      isAdmin: ticketMessages.isAdmin,
      createdAt: ticketMessages.createdAt,
      userName: users.name,
      avatarInitials: users.avatarInitials,
      avatarColor: users.avatarColor,
    })
    .from(ticketMessages)
    .leftJoin(users, eq(ticketMessages.userId, users.id))
    .where(eq(ticketMessages.ticketId, ticketId))
    .orderBy(ticketMessages.createdAt);

  return { ticket, messages };
}

// Reply to ticket (user or admin)
export async function replyToTicket(
  ticketId: string,
  userId: string,
  content: string,
  isAdmin: boolean,
) {
  const [ticket] = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))
    .limit(1);

  if (!ticket) throw new NotFoundError('Ticket');

  const [message] = await db
    .insert(ticketMessages)
    .values({
      ticketId,
      userId,
      content,
      isAdmin,
    })
    .returning();

  // Update ticket timestamp and status
  await db
    .update(supportTickets)
    .set({
      updatedAt: new Date(),
      status: isAdmin ? 'in_progress' : ticket.status,
    })
    .where(eq(supportTickets.id, ticketId));

  return message;
}

// Admin: list all tickets
export async function listAllTickets(
  page = 1,
  limit = 20,
  status?: string,
  type?: string,
  search?: string,
) {
  const offset = (page - 1) * limit;
  const conditions = [];
  if (status) conditions.push(eq(supportTickets.status, status as any));
  if (type) conditions.push(eq(supportTickets.type, type as any));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportTickets)
    .where(where);

  const tickets = await db
    .select({
      id: supportTickets.id,
      userId: supportTickets.userId,
      type: supportTickets.type,
      title: supportTickets.title,
      description: supportTickets.description,
      status: supportTickets.status,
      priority: supportTickets.priority,
      category: supportTickets.category,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.userId, users.id))
    .where(where)
    .orderBy(desc(supportTickets.updatedAt))
    .limit(limit)
    .offset(offset);

  return { data: tickets, pagination: { page, limit, total: count } };
}

// Admin: update ticket status/priority
export async function updateTicket(
  ticketId: string,
  data: { status?: string; priority?: string },
) {
  const updates: any = { updatedAt: new Date() };
  if (data.status) updates.status = data.status;
  if (data.priority) updates.priority = data.priority;

  const [updated] = await db
    .update(supportTickets)
    .set(updates)
    .where(eq(supportTickets.id, ticketId))
    .returning();

  if (!updated) throw new NotFoundError('Ticket');
  return updated;
}

// Admin: send notification to specific user
export async function sendDirectNotification(
  userId: string,
  title: string,
  body: string,
) {
  const [notif] = await db
    .insert(notifications)
    .values({
      userId,
      type: 'system',
      title,
      body,
      priority: 'high',
    })
    .returning();

  return notif;
}
