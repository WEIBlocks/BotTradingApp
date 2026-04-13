import { authenticate } from '../../middleware/authenticate.js';
import * as notificationsService from './notifications.service.js';
import { notificationsQuerySchema, notificationIdParamsSchema, updateNotificationSettingsBodySchema, dataResponseSchema, } from './notifications.schema.js';
export async function notificationsRoutes(app) {
    const zApp = app.withTypeProvider();
    // All routes require auth
    zApp.addHook('preHandler', authenticate);
    // GET / - list notifications with pagination
    zApp.get('/', {
        schema: {
            querystring: notificationsQuerySchema,
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { page, limit } = request.query;
        const result = await notificationsService.getNotifications(request.user.userId, page, limit);
        return result;
    });
    // PATCH /:id/read
    zApp.patch('/:id/read', {
        schema: {
            params: notificationIdParamsSchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { id } = request.params;
        const notification = await notificationsService.markAsRead(request.user.userId, id);
        return { data: notification };
    });
    // PUT /read-all - mark all notifications as read
    zApp.put('/read-all', {
        schema: {
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const result = await notificationsService.markAllAsRead(request.user.userId);
        return { data: result };
    });
    // GET /settings
    zApp.get('/settings', {
        schema: {
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const settings = await notificationsService.getSettings(request.user.userId);
        return { data: settings };
    });
    // PATCH /settings
    zApp.patch('/settings', {
        schema: {
            body: updateNotificationSettingsBodySchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const settings = await notificationsService.updateSettings(request.user.userId, request.body);
        return { data: settings };
    });
}
