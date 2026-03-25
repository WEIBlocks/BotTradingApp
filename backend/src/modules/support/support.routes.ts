import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import * as supportService from './support.service.js';

export async function supportRoutes(app: FastifyInstance) {
  // ── User endpoints ──

  // Create a support ticket
  app.post('/support/tickets', { preHandler: [authenticate] }, async (request, reply) => {
    const { type, title, description, category } = request.body as any;
    if (!title || !description) {
      return reply.status(400).send({ message: 'Title and description required' });
    }
    const ticket = await supportService.createTicket(request.user.userId, {
      type: type || 'support',
      title,
      description,
      category,
    });
    return { data: ticket };
  });

  // List user's own tickets
  app.get('/support/tickets', { preHandler: [authenticate] }, async (request) => {
    const { page = 1, limit = 20 } = request.query as any;
    return supportService.getUserTickets(request.user.userId, +page, +limit);
  });

  // Get ticket messages
  app.get('/support/tickets/:ticketId/messages', { preHandler: [authenticate] }, async (request) => {
    const { ticketId } = request.params as any;
    return supportService.getTicketMessages(ticketId, request.user.userId, request.user.role);
  });

  // Reply to a ticket (user)
  app.post('/support/tickets/:ticketId/messages', { preHandler: [authenticate] }, async (request, reply) => {
    const { ticketId } = request.params as any;
    const { content } = request.body as any;
    if (!content) {
      return reply.status(400).send({ message: 'Content required' });
    }
    const isAdmin = request.user.role === 'admin';
    const message = await supportService.replyToTicket(ticketId, request.user.userId, content, isAdmin);
    return { data: message };
  });

  // ── Admin endpoints ──

  // List all tickets (admin)
  app.get('/admin/support/tickets', { preHandler: [authenticate, authorize('admin')] }, async (request) => {
    const { page = 1, limit = 20, status, type, search } = request.query as any;
    return supportService.listAllTickets(+page, +limit, status, type, search);
  });

  // Update ticket status/priority (admin)
  app.patch('/admin/support/tickets/:ticketId', { preHandler: [authenticate, authorize('admin')] }, async (request) => {
    const { ticketId } = request.params as any;
    const { status, priority } = request.body as any;
    const updated = await supportService.updateTicket(ticketId, { status, priority });
    return { data: updated };
  });

  // Admin reply to ticket (also sends notification)
  app.post('/admin/support/tickets/:ticketId/messages', { preHandler: [authenticate, authorize('admin')] }, async (request, reply) => {
    const { ticketId } = request.params as any;
    const { content } = request.body as any;
    if (!content) {
      return reply.status(400).send({ message: 'Content required' });
    }
    const message = await supportService.replyToTicket(ticketId, request.user.userId, content, true);

    // Send notification to the ticket owner
    const { ticket } = await supportService.getTicketMessages(ticketId, request.user.userId, 'admin');
    await supportService.sendDirectNotification(
      ticket.userId,
      'Support Reply',
      `Your ticket "${ticket.title}" has a new response.`,
    );

    return { data: message };
  });

  // Send direct notification to a user (admin)
  app.post('/admin/users/:userId/notify', { preHandler: [authenticate, authorize('admin')] }, async (request, reply) => {
    const { userId } = request.params as any;
    const { title, body } = request.body as any;
    if (!title || !body) {
      return reply.status(400).send({ message: 'Title and body required' });
    }
    const notif = await supportService.sendDirectNotification(userId, title, body);
    return { data: notif };
  });
}
