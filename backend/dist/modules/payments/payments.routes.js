import { authenticate } from '../../middleware/authenticate.js';
import * as paymentsService from './payments.service.js';
import { addPaymentMethodBodySchema, paymentMethodIdParamsSchema, checkoutConfirmBodySchema, dataResponseSchema, messageResponseSchema, } from './payments.schema.js';
export async function paymentsRoutes(app) {
    const zApp = app.withTypeProvider();
    // All routes require auth
    zApp.addHook('preHandler', authenticate);
    // GET / - list payment methods
    zApp.get('/', {
        schema: {
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const methods = await paymentsService.getUserPaymentMethods(request.user.userId);
        return { data: methods };
    });
    // POST / - add payment method
    zApp.post('/', {
        schema: {
            body: addPaymentMethodBodySchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const method = await paymentsService.addPaymentMethod(request.user.userId, request.body);
        return { data: method };
    });
    // DELETE /:id - remove payment method
    zApp.delete('/:id', {
        schema: {
            params: paymentMethodIdParamsSchema,
            response: { 200: messageResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const { id } = request.params;
        await paymentsService.deletePaymentMethod(request.user.userId, id);
        return { message: 'Payment method removed' };
    });
    // POST /checkout/confirm
    zApp.post('/checkout/confirm', {
        schema: {
            body: checkoutConfirmBodySchema,
            response: { 200: dataResponseSchema },
            security: [{ bearerAuth: [] }],
        },
    }, async (request, _reply) => {
        const payment = await paymentsService.confirmCheckout(request.user.userId, request.body);
        return { data: payment };
    });
}
