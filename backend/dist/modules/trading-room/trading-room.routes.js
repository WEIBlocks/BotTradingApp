import { authenticate } from '../../middleware/authenticate.js';
import * as tradingRoomService from './trading-room.service.js';
import { postMessageSchema, getMessagesSchema, deleteMessageSchema } from './trading-room.schema.js';
import { z } from 'zod';
export async function tradingRoomRoutes(app) {
    const zApp = app.withTypeProvider();
    zApp.addHook('preHandler', authenticate);
    // GET /messages
    zApp.get('/messages', {
        schema: {
            querystring: getMessagesSchema.querystring,
            response: { 200: z.any() },
        },
    }, async (request) => {
        const { limit, before } = request.query;
        return tradingRoomService.getMessages(limit, before);
    });
    // POST /messages
    zApp.post('/messages', {
        schema: {
            body: postMessageSchema.body,
            response: { 200: z.any() },
        },
    }, async (request) => {
        const { content } = request.body;
        return tradingRoomService.postMessage(request.user.userId, content);
    });
    // DELETE /messages/:id
    zApp.delete('/messages/:id', {
        schema: {
            params: deleteMessageSchema.params,
        },
    }, async (request) => {
        const { id } = request.params;
        return tradingRoomService.deleteMessage(request.user.userId, id, request.user.role);
    });
    // GET /online
    zApp.get('/online', {
        schema: {
            response: { 200: z.any() },
        },
    }, async () => {
        return tradingRoomService.getOnlineCount();
    });
    // GET /members
    zApp.get('/members', {
        schema: {
            response: { 200: z.any() },
        },
    }, async () => {
        return tradingRoomService.getMembers();
    });
}
