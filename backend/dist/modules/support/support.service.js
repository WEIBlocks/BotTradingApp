import { db } from '../../config/database.js';
import { supportTickets, ticketMessages } from '../../db/schema/support.js';
import { users } from '../../db/schema/users.js';
import { sendNotification as sendNotif } from '../../lib/notify.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';
// Create ticket (from mobile)
export async function createTicket(userId, data) {
    const [ticket] = await db
        .insert(supportTickets)
        .values({
        userId,
        type: data.type,
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
export async function getUserTickets(userId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const [{ count }] = await db
        .select({ count: sql `count(*)::int` })
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
export async function getTicketMessages(ticketId, requestUserId, role) {
    // Verify access
    const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, ticketId))
        .limit(1);
    if (!ticket)
        throw new NotFoundError('Ticket');
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
export async function replyToTicket(ticketId, userId, content, isAdmin) {
    const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, ticketId))
        .limit(1);
    if (!ticket)
        throw new NotFoundError('Ticket');
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
export async function listAllTickets(page = 1, limit = 20, status, type, search) {
    const offset = (page - 1) * limit;
    const conditions = [];
    if (status)
        conditions.push(eq(supportTickets.status, status));
    if (type)
        conditions.push(eq(supportTickets.type, type));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ count }] = await db
        .select({ count: sql `count(*)::int` })
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
export async function updateTicket(ticketId, data) {
    const updates = { updatedAt: new Date() };
    if (data.status)
        updates.status = data.status;
    if (data.priority)
        updates.priority = data.priority;
    const [updated] = await db
        .update(supportTickets)
        .set(updates)
        .where(eq(supportTickets.id, ticketId))
        .returning();
    if (!updated)
        throw new NotFoundError('Ticket');
    return updated;
}
// Admin: send notification to specific user (with push)
export async function sendDirectNotification(userId, title, body) {
    const notif = await sendNotif(userId, {
        type: 'system',
        title,
        body,
        priority: 'high',
    });
    return notif;
}
